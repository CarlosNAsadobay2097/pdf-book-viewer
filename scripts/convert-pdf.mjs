/**
 * convert-pdf.mjs
 * ─────────────────────────────────────────────────────────────────
 * Convierte un PDF a imágenes WebP y genera un manifest.json.
 *
 * Uso:
 *   node scripts/convert-pdf.mjs public/MiLibro.pdf
 *   node scripts/convert-pdf.mjs public/MiLibro.pdf --scale 2 --quality 88
 *   node scripts/convert-pdf.mjs public/MiLibro.pdf --out public/pages/mi-libro
 *
 * Opciones:
 *   --out      Carpeta de salida  (default: public/pages/<nombre-pdf>)
 *   --scale    Escala de render   (default: 2 — buena calidad, tamaño razonable)
 *   --quality  Calidad WebP 1-100 (default: 85)
 *   --format   webp | png         (default: webp)
 *
 * Dependencias (instalar una sola vez):
 *   npm install --save-dev sharp pdf-to-img
 * ─────────────────────────────────────────────────────────────────
 */

import { pdf } from "pdf-to-img"
import sharp from "sharp"
import fs from "fs"
import path from "path"

// ─── Utilidades CLI ───────────────────────────────────────────────
const args = process.argv.slice(2)

function getArg(name, fallback) {
  const idx = args.indexOf(`--${name}`)
  return idx !== -1 ? args[idx + 1] : fallback
}

function fail(msg) {
  console.error(`\n❌  ${msg}\n`)
  process.exit(1)
}

// ─── Parámetros ───────────────────────────────────────────────────
const pdfPath = args.find(a => !a.startsWith("--"))
if (!pdfPath)               fail("Debes indicar la ruta al PDF.\n   Ejemplo: node scripts/convert-pdf.mjs public\ fabrica de historias.pdf.pdf"
)
if (!fs.existsSync(pdfPath)) fail(`No se encontró el archivo: "${pdfPath}"`)

const pdfName = path.basename(pdfPath, path.extname(pdfPath))
  .toLowerCase()
  .replace(/\s+/g, "-")

const outDir  = getArg("out",     `public/pages/${pdfName}`)
const SCALE   = parseFloat(getArg("scale",   "2"))
const QUALITY = parseInt(getArg("quality", "85"), 10)
const FORMAT  = getArg("format", "webp")

// ─── Preparar carpeta ─────────────────────────────────────────────
fs.mkdirSync(outDir, { recursive: true })

console.log(`\n📄  PDF      : ${pdfPath}`)
console.log(`📁  Salida   : ${outDir}`)
console.log(`🖼   Formato  : ${FORMAT.toUpperCase()}  |  Escala: ${SCALE}x  |  Calidad: ${QUALITY}`)
console.log(`─────────────────────────────────────────`)

// ─── Conversión ───────────────────────────────────────────────────
let pageCount = 0
const startTime = Date.now()

try {
  // pdf-to-img v5: export nombrado `pdf`, devuelve un async iterable
  const doc = await pdf(pdfPath, { scale: SCALE })

  for await (const pageBuffer of doc) {
    pageCount++
    const padded   = String(pageCount).padStart(3, "0")
    const fileName = `page-${padded}.${FORMAT}`
    const outPath  = path.join(outDir, fileName)

    let sharpInst = sharp(pageBuffer)

    if (FORMAT === "webp") {
      sharpInst = sharpInst.webp({ quality: QUALITY, effort: 4 })
    } else {
      sharpInst = sharpInst.png({ compressionLevel: 8 })
    }

    const info = await sharpInst.toFile(outPath)
    const kb   = (info.size / 1024).toFixed(0)
    process.stdout.write(`  ✓ Página ${pageCount}  →  ${fileName}  (${kb} KB)\n`)
  }

} catch (err) {
  fail(`Error durante la conversión:\n   ${err.message}`)
}

if (pageCount === 0) fail("No se generó ninguna página. ¿Es un PDF válido?")

// ─── Generar manifest.json (preservando interactividad existente) ─
const manifestPath = path.join(outDir, "manifest.json")

// Campos armados a mano en el editor (/editor): si ya existe un manifest
// de una conversión anterior, los rescatamos para no perder todo el
// trabajo de overlays/índice/etc. al volver a convertir el mismo PDF.
let previousInteractiveFields = {}
if (fs.existsSync(manifestPath)) {
  try {
    const previous = JSON.parse(fs.readFileSync(manifestPath, "utf-8"))
    const { overlays, revealImages, revealCardBg, tableOfContents } = previous

    previousInteractiveFields = { overlays, revealImages, revealCardBg, tableOfContents }

    if (typeof previous.pages === "number" && previous.pages !== pageCount) {
      console.log(`\n⚠️  Aviso: el PDF anterior tenía ${previous.pages} páginas y el nuevo tiene ${pageCount}.`)
      console.log(`   Se conservaron los overlays existentes, pero puede que ahora apunten`)
      console.log(`   a la página equivocada si se agregó/quitó una hoja en el medio.`)
      console.log(`   Revisalos en /editor antes de publicar.\n`)
    } else {
      console.log(`\n♻️  Se conservaron los overlays/índice del manifest anterior.\n`)
    }
  } catch {
    console.log(`\n⚠️  No se pudo leer el manifest anterior, se genera uno nuevo sin overlays.\n`)
  }
}

const manifest = {
  name:      pdfName,
  source:    path.basename(pdfPath),
  pages:     pageCount,
  format:    FORMAT,
  scale:     SCALE,
  quality:   QUALITY,
  generated: new Date().toISOString(),
  basePath:  outDir.replace(/^public/, ""),
  ...previousInteractiveFields,
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
console.log(`─────────────────────────────────────────`)
console.log(`✅  ${pageCount} páginas convertidas en ${elapsed}s`)
console.log(`📋  Manifest : ${manifestPath}`)
console.log(`\n🚀  Úsalo en tu página así:`)
console.log(`    <FlipBook manifest="${manifest.basePath}/manifest.json" />\n`)
