"use client"

import { useEffect, useState } from "react"
import { loadPdfJs } from "@/lib/pdf"
import PdfPage from "./PdfPage"
import type { PDFDocumentProxy } from "pdfjs-dist"

export default function PdfBook({ url }: { url: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isDesktop, setIsDesktop] = useState(false)

  // Carga del PDF
  useEffect(() => {
    let mounted = true
    const load = async () => {
      try {
        const pdfjs = await loadPdfJs()
        const doc = await pdfjs.getDocument(url).promise
        if (!mounted) return
        setPdf(doc)
        setNumPages(doc.numPages)
      } catch (e) {
        console.error("Error al cargar el PDF:", e)
      }
    }
    load()
    return () => { mounted = false }
  }, [url])

  // Detección de pantalla
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  if (!pdf) return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0a] text-blue-500 font-mono tracking-widest animate-pulse">
      SINCRONIZANDO EXPERIENCIA 3D...
    </div>
  )

  // Lógica de navegación
  const isCover = currentPage === 1
  const hasNextPage = currentPage + 1 <= numPages
  const showDoublePage = isDesktop && !isCover && hasNextPage
  const isLastPage = isDesktop 
    ? (isCover ? currentPage >= numPages : currentPage + 1 >= numPages)
    : (currentPage >= numPages)

  const nextPage = () => {
    setCurrentPage(p => {
      if (isDesktop) {
        if (p === 1) return Math.min(2, numPages)
        return Math.min(p + 2, numPages)
      }
      return Math.min(p + 1, numPages)
    })
  }

  const prevPage = () => {
    setCurrentPage(p => {
      if (isDesktop) {
        if (p <= 2) return 1
        return Math.max(p - 2, 1)
      }
      return Math.max(p - 1, 1)
    })
  }

  return (
    <div className="w-full h-screen flex flex-col bg-[#0d0d0d] overflow-hidden select-none text-white">
      
      {/* ÁREA DE LECTURA CON PERSPECTIVA */}
      <div className="flex-1 flex items-center justify-center p-4 md:p-10" style={{ perspective: "3000px" }}>
        
        <div 
          key={currentPage} // ESTA KEY ES VITAL: Reinicia la animación al cambiar de página
          className="relative flex"
          style={{ 
            transformStyle: "preserve-3d",
            maxWidth: "95vw",
            maxHeight: "75vh",
            // DURACIÓN Y CURVA: 1.2s para que sea pausado y elegante
            transition: "transform 1.2s cubic-bezier(0.645, 0.045, 0.355, 1)",
            transform: isCover ? "rotateY(0deg)" : "rotateY(-3deg) rotateX(1deg)",
            // Animación de entrada sutil
            animation: "pageOpening 1.2s ease-out"
          }}
        >
          {/* Lado Izquierdo */}
          {currentPage <= numPages && (
            <div className="relative group shadow-[0_20px_50px_rgba(0,0,0,0.8)]" style={{ transformStyle: "preserve-3d" }}>
              <PdfPage pdf={pdf} pageNumber={currentPage} />
              
              {/* Brillo en esquina izquierda */}
              {currentPage > 1 && (
                <div 
                  className="absolute top-0 left-0 w-32 h-32 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 60%)",
                    clipPath: "polygon(0 0, 100% 0, 0 100%)"
                  }}
                />
              )}
            </div>
          )}

          {/* Lado Derecho */}
          {showDoublePage && (
            <div className="relative group shadow-[0_20px_50px_rgba(0,0,0,0.8)] border-l border-black/30" style={{ transformStyle: "preserve-3d" }}>
              <PdfPage pdf={pdf} pageNumber={currentPage + 1} />
              
              {!isLastPage && (
                <div 
                  className="absolute top-0 right-0 w-32 h-32 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: "linear-gradient(-135deg, rgba(255,255,255,0.1) 0%, transparent 60%)",
                    clipPath: "polygon(100% 0, 100% 100%, 0 0)"
                  }}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* 🛠 BARRA DE NAVEGACIÓN REFORZADA */}
      <div className="min-h-[120px] h-32 bg-black/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between px-6 md:px-16 z-50 shadow-[0_-15px_40px_rgba(0,0,0,0.5)]">
        
        <div className="flex-1 hidden sm:flex">
          <button 
            onClick={() => setCurrentPage(1)}
            className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 transition-all text-[10px] uppercase tracking-[0.2em] text-gray-500 hover:text-white"
          >
            Portada
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-8 md:gap-12">
            <button
              onClick={prevPage}
              disabled={currentPage === 1}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90"
            >
              <span className="text-xl">❮</span>
            </button>

            <div className="flex flex-col items-center min-w-[100px]">
              <div className="text-2xl font-light tracking-tighter">
                <span className="text-blue-500 font-bold">{currentPage}</span>
                {showDoublePage && <span className="text-gray-600"> - {currentPage + 1}</span>}
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                <div 
                  className="h-full bg-blue-500 transition-all duration-700 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                  style={{ width: `${(currentPage / numPages) * 100}%` }}
                />
              </div>
            </div>

            <button
              onClick={nextPage}
              disabled={isLastPage}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90"
            >
              <span className="text-xl">❯</span>
            </button>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-mono">
             {numPages} Páginas totales
          </span>
        </div>

        <div className="flex-1 hidden sm:flex justify-end">
           <div className="text-[9px] text-gray-800 border border-gray-800/50 px-2 py-1 rounded">
             3D ENGINE V1.2
           </div>
        </div>

      </div>

      {/* ESTILOS DE ANIMACIÓN ADICIONALES */}
      <style jsx>{`
        @keyframes pageOpening {
          from { transform: rotateY(15deg) scale(0.95); opacity: 0.5; }
          to { transform: rotateY(-3deg) scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}