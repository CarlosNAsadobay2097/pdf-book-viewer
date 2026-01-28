"use client"

let pdfjsLib: any = null

export const loadPdfJs = async () => {
  if (typeof window === "undefined") return null

  if (!pdfjsLib) {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf")

    // Worker como URL plana (debe existir en /public)
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"

    pdfjsLib = pdfjs
  }

  return pdfjsLib
}
