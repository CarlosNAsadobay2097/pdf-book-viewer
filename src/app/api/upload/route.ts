import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import { bookBasePath, bookConfig } from "@/lib/book-config"

// fs.writeFile necesita Node runtime, no Edge.
export const runtime = "nodejs"

const IMAGE_TYPES = ["image/webp", "image/gif", "image/png", "image/jpeg"]
const AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm"]
const PDF_TYPES = ["application/pdf"]

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9.\-_]/g, "_")
}

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Las subidas al disco solo están disponibles en desarrollo local. Usa /probar para archivos temporales." }, { status: 403 })
  }
  try {
    const formData = await req.formData()
    const file = formData.get("file")

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 })
    }

    const isImage = IMAGE_TYPES.includes(file.type)
    const isAudio = AUDIO_TYPES.includes(file.type)
    const isPdf   = PDF_TYPES.includes(file.type)

    if (!isImage && !isAudio && !isPdf) {
      return NextResponse.json(
        { error: `Tipo de archivo no soportado: ${file.type || "desconocido"}` },
        { status: 400 }
      )
    }

    // Límite simple para evitar subidas gigantes por error.
    // Los PDF (aunque comprimidos) suelen pesar más que una imagen/audio suelto.
    const maxSize = isPdf ? 40 * 1024 * 1024 : 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `El archivo pesa más de ${maxSize / (1024 * 1024)} MB` },
        { status: 400 }
      )
    }

    const subfolder = isImage ? "assets/images" : isAudio ? "assets/audio" : "assets/downloads"
    const dir = path.join(process.cwd(), "public", "pages", bookConfig.id, subfolder)
    await fs.mkdir(dir, { recursive: true })

    const safeName = `${Date.now()}-${sanitizeFileName(file.name)}`
    const filePath = path.join(dir, safeName)

    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    const publicUrl = `${bookBasePath}/${subfolder}/${safeName}`
    return NextResponse.json({ url: publicUrl })
  } catch {
    return NextResponse.json({ error: "No se pudo subir el archivo" }, { status: 500 })
  }
}
