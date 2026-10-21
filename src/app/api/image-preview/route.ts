import { getImagePreview, ImagePreviewError } from "@/lib/image-preview"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const src = new URL(request.url).searchParams.get("src")
    if (!src) throw new ImagePreviewError(400, "Missing image source")
    const { buffer, format, animated } = await getImagePreview(src)
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, max-age=300",
        "X-Image-Format": format,
        "X-Image-Animated": String(animated),
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    const status = error instanceof ImagePreviewError ? error.status : 500
    return Response.json(
      { error: status === 500 ? "Could not generate image preview" : (error as ImagePreviewError).message },
      { status, headers: { "Cache-Control": "no-store" } },
    )
  }
}
