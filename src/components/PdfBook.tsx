"use client"

import { useEffect, useState, useRef } from "react"
import { loadPdfJs } from "@/lib/pdf"
import PdfPage from "./PdfPage"

export default function PdfBook({ url }: { url: string }) {
  const [pdf, setPdf] = useState<any>(null)
  const [numPages, setNumPages] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [isDesktop, setIsDesktop] = useState(false)
  
  // Ref para manejar el Swipe
  const touchStart = useRef<number | null>(null)

  // 1. Cargar PDF
  useEffect(() => {
    let mounted = true
    const load = async () => {
      const pdfjs = await loadPdfJs()
      const doc = await pdfjs.getDocument(url).promise
      if (!mounted) return
      setPdf(doc)
      setNumPages(doc.numPages)
      setCurrentPage(1)
    }
    load()
    return () => { mounted = false }
  }, [url])

  // 2. Detectar Desktop (Breakpoint de Tablet/PC)
  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  if (!pdf) return <div className="w-full h-screen flex items-center justify-center bg-gray-900 text-white">Cargando PDF…</div>

  // 3. Reglas editoriales y de estado
  const isCover = currentPage === 1
  const hasBackCover = numPages % 2 === 0
  
  // Determinar si hay una página siguiente disponible para modo doble
  const showDoublePage = isDesktop && !isCover && currentPage + 1 <= numPages

  const isLastPage = isDesktop 
    ? (showDoublePage ? currentPage + 1 >= numPages : currentPage >= numPages)
    : currentPage >= numPages

  // 4. Navegación Corregida (Separación lógica Móvil vs Desktop)
  const nextPage = () => {
    setCurrentPage(p => {
      if (isDesktop) {
        if (p === 1) return 2 // De portada a primera doble página
        return Math.min(p + 2, numPages)
      }
      return Math.min(p + 1, numPages) // Lineal en móvil
    })
  }

  const prevPage = () => {
    setCurrentPage(p => {
      if (isDesktop) {
        if (p <= 3) return 1 // Si estás en 2-3 o solo 2, vuelve a la portada
        return Math.max(p - 2, 1)
      }
      return Math.max(p - 1, 1) // Lineal en móvil
    })
  }

  // 5. Manejo de Gestos (Swipe)
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.targetTouches[0].clientX
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return
    const touchEnd = e.changedTouches[0].clientX
    const distance = touchStart.current - touchEnd
    const threshold = 50 // Sensibilidad del swipe

    if (distance > threshold && !isLastPage) nextPage()
    if (distance < -threshold && currentPage > 1) prevPage()
    
    touchStart.current = null
  }

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-[#1a1a1a] select-none">
      
      {/* Área del libro con soporte táctil */}
      <div 
        className="flex-1 flex items-center justify-center overflow-hidden touch-none"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div className={`flex shadow-2xl transition-all duration-300 ${isDesktop ? "" : "w-full justify-center"}`}>
          {/* Página Actual (Izquierda o Única) */}
          <PdfPage
            key={`page-${currentPage}`}
            pdf={pdf}
            pageNumber={currentPage}
          />

          {/* Segunda Página (Derecha) */}
          {showDoublePage && (
            <PdfPage
              key={`page-${currentPage + 1}`}
              pdf={pdf}
              pageNumber={currentPage + 1}
            />
          )}
        </div>
      </div>

      {/* Controles Estilizados */}
      <div className="h-20 flex flex-col items-center justify-center gap-2 border-t border-gray-800 bg-[#111] text-white shrink-0 shadow-inner">
        <div className="flex items-center gap-8">
          <button 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={currentPage <= 1} 
            onClick={prevPage}
          >
            ◀
          </button>

          <span className="font-mono text-sm tracking-widest">
            {currentPage}{showDoublePage ? ` – ${currentPage + 1}` : ""} / {numPages}
          </span>

          <button 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            disabled={isLastPage} 
            onClick={nextPage}
          >
            ▶
          </button>
        </div>
        
        {/* Barra de progreso visual abajo */}
        <div className="w-64 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div 
            className="h-full bg-blue-500 transition-all duration-300" 
            style={{ width: `${(currentPage / numPages) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}