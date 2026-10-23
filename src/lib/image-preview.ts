import { open, realpath, stat } from "node:fs/promises"
import path from "node:path"
import sharp from "sharp"

const MAX_BYTES = 20 * 1024 * 1024
const MAX_PIXELS = 40_000_000
const CACHE_LIMIT = 128
const EXTENSIONS = new Set([".webp", ".gif", ".png", ".jpg", ".jpeg", ".avif"])

type ImagePreview = { buffer: Buffer; format: string; animated: boolean }
const cache = new Map<string, { value: ImagePreview; expires: number }>()
const pending = new Map<string, Promise<ImagePreview>>()
const waiting: Array<() => void> = []
let active = 0

export class ImagePreviewError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = "ImagePreviewError"
  }
}

export async function getImagePreview(src: string): Promise<ImagePreview> {
  try {
    if (!src.startsWith("/") || src.startsWith("//") || /[\x00-\x1f\x7f\\]/.test(src)) {
      throw new ImagePreviewError(400, "Invalid image source")
    }

    let pathname: string
    try {
      // Parse query/hash before decoding so encoded filename characters stay literal.
      pathname = decodeURIComponent(src.split(/[?#]/, 1)[0])
    } catch {
      throw new ImagePreviewError(400, "Invalid image source")
    }
    if (
      !pathname.startsWith("/pages/") || pathname.includes("//") || /[\x00-\x1f\x7f\\:]/.test(pathname) ||
      pathname.split("/").some(segment => segment === "." || segment === "..")
    ) {
      throw new ImagePreviewError(400, "Invalid image source")
    }
    if (!EXTENSIONS.has(path.extname(pathname).toLowerCase())) {
      throw new ImagePreviewError(415, "Unsupported image type")
    }

    let input: string | Buffer
    let remote: string | undefined
    let key: string
    try {
      const root = await realpath(path.join(process.cwd(), "public", "pages"))
      input = await realpath(path.resolve(root, pathname.slice("/pages/".length)))
      const relative = path.relative(root, input)
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
        throw new ImagePreviewError(400, "Invalid image source")
      }
      // Assets are served separately; serverless uses the trusted origin fallback.
      // Do not trace the project for a runtime path already confined to /pages/.
      const info = await stat(/* turbopackIgnore: true */ input)
      if (!info.isFile()) throw new ImagePreviewError(415, "Source is not an image file")
      if (info.size > MAX_BYTES) throw new ImagePreviewError(413, "Image exceeds 20 MiB")
      key = JSON.stringify([input, info.mtimeMs, info.size])
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
      // Only deployment configuration can supply the origin, never request headers.
      const env = process.env
      const vercel = env.VERCEL_URL || env.VERCEL_PROJECT_PRODUCTION_URL
      const configured = env.EDITOR_ASSET_ORIGIN || env.URL || env.DEPLOY_PRIME_URL ||
        (vercel ? `https://${vercel}` : undefined) || env.RENDER_EXTERNAL_URL
      if (!configured) throw new ImagePreviewError(404, "Image not found")
      let origin: URL
      try {
        origin = new URL(configured)
        if (origin.protocol !== "https:" || origin.username || origin.password || origin.port ||
          origin.pathname !== "/" || origin.search || origin.hash || configured.includes("\\")) throw new Error()
      } catch {
        throw new ImagePreviewError(500, "Invalid asset origin configuration")
      }
      remote = origin.origin + pathname.split("/").map(encodeURIComponent).join("/")
      input = "" // The original remote buffer lives only for the duration of this work.
      key = JSON.stringify([remote])
    }

    const cached = cache.get(key)
    if (cached && cached.expires > Date.now()) {
      cache.delete(key)
      cache.set(key, cached)
      return cached.value
    }
    cache.delete(key)
    const running = pending.get(key)
    if (running) return await running
    if (pending.size >= 32) throw new ImagePreviewError(503, "Image preview queue is full")

    const work = (async (): Promise<ImagePreview> => {
      if (active >= 4) await new Promise<void>(resolve => waiting.push(resolve))
      else active++
      try {
        if (remote) {
          try {
            const response = await fetch(remote, { redirect: "error", signal: AbortSignal.timeout(10_000), cache: "no-store" })
            const reader = response.body?.getReader()
            try {
              if (!response.ok) throw new ImagePreviewError(response.status === 404 ? 404 : 502, "Asset download failed")
              if (Number(response.headers.get("content-length")) > MAX_BYTES) throw new ImagePreviewError(413, "Image exceeds 20 MiB")
              if (!reader) throw new ImagePreviewError(502, "Empty asset response")
              const chunks: Uint8Array[] = []
              let size = 0
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                size += value.byteLength
                if (size > MAX_BYTES) throw new ImagePreviewError(413, "Image exceeds 20 MiB")
                chunks.push(value)
              }
              input = Buffer.concat(chunks, size)
            } finally {
              await reader?.cancel().catch(() => {})
            }
          } catch (error) {
            if (error instanceof ImagePreviewError) throw error
            throw new ImagePreviewError(502, "Asset download failed or timed out")
          }
        }
        // Check magic bytes before invoking a decoder, including disguised SVG input.
        let bytes: Buffer
        if (Buffer.isBuffer(input)) bytes = input.subarray(0, 64)
        else {
          const file = await open(/* turbopackIgnore: true */ input, "r")
          const header = Buffer.alloc(64)
          try {
            if ((await file.stat()).size > MAX_BYTES) throw new ImagePreviewError(413, "Image exceeds 20 MiB")
            bytes = header.subarray(0, (await file.read(header, 0, header.length, 0)).bytesRead)
          } finally {
            await file.close()
          }
        }
        const length = bytes.length
        const avif = bytes.toString("ascii", 4, 8) === "ftyp" &&
          [8, ...Array.from({ length: Math.max(0, Math.floor((length - 16) / 4)) }, (_, i) => 16 + i * 4)]
            .some(offset => ["avif", "avis"].includes(bytes.toString("ascii", offset, offset + 4)))
        const supported =
          bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) ||
          bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
          ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6)) ||
          (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") || avif
        if (!supported) throw new ImagePreviewError(415, "Unsupported image type")

        let result: ImagePreview
        try {
          // Metadata inspects the original; only the render is restricted to page zero.
          const metadata = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata()
          const buffer = await sharp(input, { page: 0, pages: 1, limitInputPixels: MAX_PIXELS })
            .autoOrient()
            .resize(96, 96, { fit: "inside", withoutEnlargement: true })
            .webp()
            .toBuffer()
          result = {
            buffer,
            format: avif ? "AVIF" : (metadata.format ?? "unknown").toUpperCase(),
            animated: (metadata.pages ?? 1) > 1,
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code) throw error
          throw new ImagePreviewError(422, "Image is corrupt or exceeds the pixel limit")
        }
        cache.set(key, { value: result, expires: remote ? Date.now() + 300_000 : Infinity })
        if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
        return result
      } finally {
        // Transfer the occupied slot directly to the next waiter.
        const next = waiting.shift()
        if (next) next()
        else active--
      }
    })()
    pending.set(key, work)
    try {
      return await work
    } finally {
      pending.delete(key)
    }
  } catch (error) {
    if (error instanceof ImagePreviewError) throw error
    if ((error as NodeJS.ErrnoException).code === "ENOENT" || (error as NodeJS.ErrnoException).code === "ENOTDIR") {
      throw new ImagePreviewError(404, "Image not found")
    }
    throw error
  }
}
