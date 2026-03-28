"use client"

/**
 * FlipBook.tsx — v5.0
 * ─────────────────────────────────────────────────────────────────
 * Mejoras v5:
 * - Lee el aspect ratio real de la primera imagen del PDF
 * - Calcula width/height de StPageFlip a partir del tamaño real
 * - Portada/contraportada centradas solas (página única)
 * - Doble página centrada al navegar
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from "react"
import type { SizeType } from "page-flip"

// ─── Tipos ────────────────────────────────────────────────────────
interface Manifest {
  name: string
  source: string
  pages: number
  format: string
  basePath: string
}

interface FlipBookProps {
  manifest: string
  title?: string
}

// ─── Utilidad: URL de página ──────────────────────────────────────
function pageUrl(basePath: string, format: string, n: number): string {
  return `${basePath}/page-${String(n).padStart(3, "0")}.${format}`
}

// ─── Utilidad: leer dimensiones reales de una imagen ─────────────
function getImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = reject
    img.src = src
  })
}

// ─── Componente principal ─────────────────────────────────────────
export default function FlipBook({ manifest: manifestUrl, title }: FlipBookProps) {
  const [manifest, setManifest]         = useState<Manifest | null>(null)
  const [error, setError]               = useState<string | null>(null)
  const [currentPage, setCurrentPage]   = useState(0)
  const [isReady, setIsReady]           = useState(false)
  // isCoverView: true cuando estamos en portada o contraportada (página única)
  const [isCoverView, setIsCoverView]   = useState(true)

  const bookRef  = useRef<HTMLDivElement>(null)
  const wrapRef  = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipRef  = useRef<any>(null)

  // ── Cargar manifest ──────────────────────────────────────────
  useEffect(() => {
    fetch(manifestUrl)
      .then(r => {
        if (!r.ok) throw new Error(`No se pudo cargar: ${r.status}`)
        return r.json()
      })
      .then(setManifest)
      .catch(e => setError(e.message))
  }, [manifestUrl])

  // ── Inicializar StPageFlip ───────────────────────────────────
  useEffect(() => {
    if (!manifest || !bookRef.current) return

    let destroyed = false

    const init = async () => {
      const { PageFlip } = await import("page-flip")
      if (destroyed || !bookRef.current) return

      const { pages, format, basePath } = manifest

      // 1. Leer el tamaño real de la primera página del PDF
      const firstUrl = pageUrl(basePath, format, 1)
      const { w: imgW, h: imgH } = await getImageSize(firstUrl)
      if (destroyed) return

      const aspectRatio = imgW / imgH   // ej: 0.77 para A4 portrait

      // 2. Calcular dimensiones que encajan en la pantalla
      //    respetando el aspect ratio real de las páginas
      const vw        = window.innerWidth
      const vh        = window.innerHeight
      const navH      = 112   // altura de la barra de navegación
      const padding   = 48    // padding vertical total
      const maxH      = vh - navH - padding
      const maxW      = vw - padding

      // Empezamos ajustando por alto
      let pageH = maxH
      let pageW = Math.round(pageH * aspectRatio)

      // Si la doble página no cabe en ancho, ajustamos por ancho
      const isDesktop   = vw >= 1024
      const doubleWidth = isDesktop ? pageW * 2 : pageW
      if (doubleWidth > maxW) {
        pageW = Math.round(maxW / (isDesktop ? 2 : 1))
        pageH = Math.round(pageW / aspectRatio)
      }

      // 3. Inicializar StPageFlip con las dimensiones reales
      const pf = new PageFlip(bookRef.current, {
        width:               pageW,
        height:              pageH,
        size:                "fixed" as SizeType,
        showCover:           true,
        drawShadow:          true,
        flippingTime:        700,
        usePortrait:         !isDesktop,
        autoSize:            false,   // nosotros controlamos el tamaño
        maxShadowOpacity:    0.5,
        mobileScrollSupport: false,
      })

      // 4. Crear páginas HTML con portada/contraportada hard
      const container = bookRef.current!
      container.querySelectorAll(".pf-page").forEach(el => el.remove())

      Array.from({ length: pages }, (_, i) => {
        const n       = i + 1
        const isFirst = n === 1
        const isLast  = n === pages

        const div = document.createElement("div")
        div.className = "pf-page"
        // Portada y contraportada = tapa dura → página única
        if (isFirst || isLast) div.setAttribute("data-density", "hard")

        const img = document.createElement("img")
        img.src            = pageUrl(basePath, format, n)
        img.alt            = isFirst ? "Portada" : isLast ? "Contraportada" : `Página ${n}`
        img.draggable      = false
        // object-fit: fill respeta exactamente el tamaño que StPageFlip asigna
        img.style.cssText  = "width:100%;height:100%;object-fit:fill;display:block;"

        div.appendChild(img)
        container.appendChild(div)
      })

      pf.loadFromHTML(container.querySelectorAll(".pf-page"))

      // 5. Eventos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("flip", (e: any) => {
        const idx     = e.data as number
        const total   = manifest.pages
        const isCover = idx === 0 || idx >= total - 1
        setCurrentPage(idx)
        setIsCoverView(isCover)
      })

      // Actualizar isCoverView también durante la animación de flip
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("changeState", (e: any) => {
        const idx     = pf.getCurrentPageIndex() as number
        const total   = manifest.pages
        const isCover = idx === 0 || idx >= total - 1
        setIsCoverView(isCover)
      })

      flipRef.current = pf
      setIsReady(true)
    }

    init()

    return () => {
      destroyed = true
      if (flipRef.current) {
        try { flipRef.current.destroy() } catch (_) {}
        flipRef.current = null
        setIsReady(false)
      }
    }
  }, [manifest])

  // ── Navegación ───────────────────────────────────────────────
  const goNext = useCallback(() => flipRef.current?.flipNext("bottom"), [])
  const goPrev = useCallback(() => flipRef.current?.flipPrev("bottom"), [])
  const goFirst = useCallback(() => {
    flipRef.current?.turnToPage(0)
    setCurrentPage(0)
    setIsCoverView(true)
  }, [])

  // ── Teclado ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext()
      if (e.key === "ArrowLeft")  goPrev()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goNext, goPrev])

  // ── UI derivada ──────────────────────────────────────────────
  const totalPages  = manifest?.pages ?? 0
  const displayPage = currentPage + 1
  const isFirstPage = currentPage === 0
  const isLastPage  = currentPage >= totalPages - 1
  const progress    = totalPages > 1 ? (currentPage / (totalPages - 1)) * 100 : 0

  // ── Error ────────────────────────────────────────────────────
  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0a0a0a] gap-4 p-8">
      <div className="text-red-500 font-mono text-sm">⚠ Error al cargar el visor</div>
      <div className="text-gray-600 text-xs max-w-sm text-center">{error}</div>
      <div className="text-gray-700 text-xs mt-2 text-center">
        Asegúrate de correr primero:<br />
        <code className="text-gray-500 mt-1 block">
          node scripts/convert-pdf.mjs public/TuArchivo.pdf
        </code>
      </div>
    </div>
  )

  if (!manifest) return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0a] text-blue-500 font-mono tracking-widest animate-pulse">
      CARGANDO...
    </div>
  )

  // ── Render ───────────────────────────────────────────────────
  return (
    <div
      className="w-full h-screen flex flex-col bg-[#0d0d0d] overflow-hidden select-none text-white"
      role="region"
      aria-label={title ?? manifest.name}
    >

      {/* ── ÁREA DEL LIBRO ── */}
      {/*
        El wrapper centra el libro tanto en vista de portada (mitad)
        como en vista de doble página (completo).
        StPageFlip controla el ancho real del canvas — nosotros solo
        nos aseguramos de que esté centrado verticalmente.
      */}
      <div
        ref={wrapRef}
        className="flex-1 flex items-center justify-center overflow-hidden"
        style={{
          // Transición suave cuando el libro cambia de ancho
          // (portada → doble página y viceversa)
          transition: "padding 0.4s ease",
        }}
      >
        {!isReady && (
          <div className="absolute text-blue-500 font-mono text-sm tracking-widest animate-pulse z-10">
            PREPARANDO LIBRO...
          </div>
        )}
        <div
          ref={bookRef}
          style={{
            opacity:    isReady ? 1 : 0,
            transition: "opacity 0.4s ease, transform 0.5s cubic-bezier(0.4,0,0.2,1)",
            // Cuando estamos en portada o contraportada, StPageFlip centra la página
            // en la mitad derecha o izquierda del canvas doble.
            // Compensamos con translateX para que la página quede visualmente centrada.
            transform: isCoverView
              ? (isLastPage ? "translateX(25%)" : "translateX(-25%)")
              : "translateX(0)",
          }}
        />
      </div>

      {/* ── BARRA DE NAVEGACIÓN ── */}
      <nav
        className="min-h-[110px] h-28 bg-black/80 backdrop-blur-2xl border-t border-white/5 flex items-center justify-between px-6 md:px-16 z-50"
        aria-label="Navegación del libro"
      >
        <div className="flex-1 hidden sm:flex">
          <button
            onClick={goFirst}
            disabled={isFirstPage}
            className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 transition-all text-[10px] uppercase tracking-[0.2em] text-gray-500 hover:text-white"
          >
            Portada
          </button>
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-8 md:gap-12">
            <button
              onClick={goPrev}
              disabled={isFirstPage}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90"
              aria-label="Página anterior"
            >
              <span className="text-xl">❮</span>
            </button>

            <div className="flex flex-col items-center min-w-[110px]">
              <div className="text-2xl font-light tracking-tighter">
                <span className="text-blue-500 font-bold">{displayPage}</span>
                <span className="text-gray-600"> / {totalPages}</span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mt-2 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* Indicador de vista actual */}
              <span className="text-[9px] text-gray-700 mt-1 font-mono uppercase tracking-wider">
                {isCoverView ? "portada" : "doble página"}
              </span>
            </div>

            <button
              onClick={goNext}
              disabled={isLastPage}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90"
              aria-label="Página siguiente"
            >
              <span className="text-xl">❯</span>
            </button>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-gray-600 font-mono">
            {totalPages} páginas · arrastra para voltear
          </span>
        </div>

        <div className="flex-1 hidden sm:flex justify-end">
          <div className="text-[9px] text-gray-800 border border-gray-800/50 px-2 py-1 rounded">
            FLIP ENGINE V5.0
          </div>
        </div>
      </nav>
    </div>
  )
}
