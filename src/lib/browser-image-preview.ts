"use client"

const MAX_BYTES = 20 * 1024 * 1024
const MAX_PIXELS = 40_000_000

export async function createBrowserImagePreview(blob: Blob): Promise<{ blob: Blob; format: string; animated: boolean | null }> {
  if (!(blob instanceof Blob) || !blob.size) throw new Error("La imagen esta vacia")
  if (blob.size > MAX_BYTES) throw new Error("La imagen supera el limite de 20 MiB")
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  const text = (offset: number, length: number) => String.fromCharCode(...bytes.subarray(offset, offset + length))
  const checkSize = (width: number, height: number) => {
    if (!width || !height || width * height > MAX_PIXELS) throw new Error("La imagen es invalida o supera 40 millones de pixeles")
  }
  let format: string
  let animated: boolean | null = null

  if (bytes.length >= 13 && ["GIF87a", "GIF89a"].includes(text(0, 6))) {
    format = "GIF"
    checkSize(view.getUint16(6, true), view.getUint16(8, true))
    let offset = 13 + (bytes[10] & 0x80 ? 3 * (1 << ((bytes[10] & 7) + 1)) : 0)
    let frames = 0
    const skipBlocks = () => {
      while (offset < bytes.length) {
        const length = bytes[offset++]
        if (!length) return true
        offset += length
      }
      return false
    }
    // Skip color tables, extensions and compressed sub-blocks, not comma bytes in image data.
    while (offset < bytes.length) {
      const marker = bytes[offset++]
      if (marker === 0x3b) { animated = frames > 1; break }
      if (marker === 0x21) {
        offset++
        if (!skipBlocks()) break
      } else if (marker === 0x2c) {
        if (offset + 9 > bytes.length) break
        checkSize(view.getUint16(offset + 4, true), view.getUint16(offset + 6, true))
        const packed = bytes[offset + 8]
        offset += 9 + (packed & 0x80 ? 3 * (1 << ((packed & 7) + 1)) : 0)
        offset++ // LZW minimum code size
        if (!skipBlocks()) break
        frames++
        if (frames > 1) { animated = true; break }
      } else break
    }
  } else if (bytes.length >= 24 && text(0, 8) === "\x89PNG\r\n\x1a\n" && text(12, 4) === "IHDR") {
    format = "PNG"
    checkSize(view.getUint32(16), view.getUint32(20))
    let offset = 8
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset)
      const type = text(offset + 4, 4)
      if (offset + 12 + length > bytes.length) break
      if (type === "acTL" && length === 8) { animated = view.getUint32(offset + 8) > 1; break }
      if (type === "IEND") { animated = false; break }
      offset += 12 + length
    }
  } else if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    format = "WEBP"
    const end = view.getUint32(4, true) + 8
    let offset = 12
    while (offset + 8 <= Math.min(end, bytes.length)) {
      const type = text(offset, 4)
      const length = view.getUint32(offset + 4, true)
      const data = offset + 8
      if (data + length > Math.min(end, bytes.length)) break
      if (type === "ANIM" || type === "ANMF") animated = true
      if (type === "VP8X" && length >= 10) {
        const uint24 = (i: number) => bytes[i] | bytes[i + 1] << 8 | bytes[i + 2] << 16
        checkSize(uint24(data + 4) + 1, uint24(data + 7) + 1)
      } else if (type === "VP8 " && length >= 10 && text(data + 3, 3) === "\x9d\x01\x2a") {
        checkSize(view.getUint16(data + 6, true) & 0x3fff, view.getUint16(data + 8, true) & 0x3fff)
      } else if (type === "VP8L" && length >= 5 && bytes[data] === 0x2f) {
        const dimensions = view.getUint32(data + 1, true)
        checkSize((dimensions & 0x3fff) + 1, ((dimensions >>> 14) & 0x3fff) + 1)
      }
      offset = data + length + (length & 1)
    }
    if (animated === null && offset === end && end <= bytes.length) animated = false
  } else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    format = "JPEG"
    animated = false
    let offset = 2
    while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
      while (bytes[offset] === 0xff) offset++
      const marker = bytes[offset++]
      if (marker === 0xda || marker === 0xd9) break
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
      if (offset + 2 > bytes.length) break
      const length = view.getUint16(offset)
      if (length < 2 || offset + length > bytes.length) break
      if (length >= 7 && marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        checkSize(view.getUint16(offset + 5), view.getUint16(offset + 3))
        break
      }
      offset += length
    }
  } else if (bytes.length >= 16 && text(4, 4) === "ftyp" &&
    [8, ...Array.from({ length: Math.max(0, Math.floor((Math.min(view.getUint32(0), bytes.length) - 16) / 4)) }, (_, i) => 16 + i * 4)]
      .some(offset => ["avif", "avis"].includes(text(offset, 4)))) {
    format = "AVIF"
  } else {
    throw new Error("Tipo de imagen no soportado")
  }

  let bitmap: ImageBitmap | undefined
  let sourceUrl: string | undefined
  let image: HTMLImageElement | undefined
  let canvas: HTMLCanvasElement | undefined
  try {
    let source: CanvasImageSource
    let width: number
    let height: number
    if (typeof createImageBitmap === "function") {
      bitmap = await createImageBitmap(blob)
      source = bitmap
      width = bitmap.width
      height = bitmap.height
    } else {
      sourceUrl = URL.createObjectURL(blob)
      image = new Image()
      await new Promise<void>((resolve, reject) => {
        image!.onload = () => resolve()
        image!.onerror = () => reject(new Error("No se pudo decodificar la imagen"))
        image!.src = sourceUrl!
      })
      source = image
      width = image.naturalWidth
      height = image.naturalHeight
    }
    checkSize(width, height)
    const scale = Math.min(1, 96 / width, 96 / height)
    canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("No se pudo crear la miniatura")
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    const preview = await new Promise<Blob>((resolve, reject) => {
      canvas!.toBlob(result => result ? resolve(result) : reject(new Error("No se pudo crear la miniatura")), "image/webp")
    })
    return { blob: preview, format, animated }
  } finally {
    bitmap?.close()
    if (canvas) { canvas.width = 0; canvas.height = 0 }
    if (image) { image.onload = null; image.onerror = null; image.removeAttribute("src") }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl)
  }
}
