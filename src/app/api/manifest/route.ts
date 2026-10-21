import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import type { Manifest } from "@/types/overlay"
import { bookBasePath, bookConfig } from "@/lib/book-config"

function manifestPath() {
  return path.join(process.cwd(), "public", "pages", bookConfig.id, "manifest.json")
}

export async function GET() {
  try {
    const raw = await fs.readFile(manifestPath(), "utf-8")
    return NextResponse.json(JSON.parse(raw) as Manifest)
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer el manifest" },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "La edición de archivos solo está disponible en desarrollo local. Usa /probar para una copia temporal." }, { status: 403 })
  }
  try {
    const body = (await req.json()) as Manifest

    if (!body || typeof body.pages !== "number" || !body.basePath) {
      return NextResponse.json({ error: "Manifest inválido" }, { status: 400 })
    }

    // A tab opened before changing books must not overwrite the new book.
    if (body.basePath !== bookBasePath) {
      return NextResponse.json({ error: "El manifiesto no corresponde al libro activo. Recarga el editor." }, { status: 409 })
    }

    // El servidor de desarrollo no autentica usuarios; no debe exponerse a Internet.
    await fs.writeFile(manifestPath(), JSON.stringify(body, null, 2), "utf-8")
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: "No se pudo guardar el manifest" },
      { status: 500 }
    )
  }
}
