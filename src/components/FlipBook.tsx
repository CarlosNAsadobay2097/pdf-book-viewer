"use client"

/**
 * FlipBook.tsx — v6.1
 * Arquitectura corregida: el div que StPageFlip controla está
 * completamente aislado de React usando un portal manual.
 * React nunca toca los hijos de bookRef — solo StPageFlip.
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

type DeviceMode = "mobile" | "tablet" | "desktop"

function getMode(vw: number): DeviceMode {
  if (vw >= 1024) return "desktop"
  if (vw >= 768)  return "tablet"
  return "mobile"
}

function pageUrl(basePath: string, format: string, n: number): string {
  return `${basePath}/page-${String(n).padStart(3, "0")}.${format}`
}

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
  const [manifest, setManifest]       = useState<Manifest | null>(null)
  const [error, setError]             = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(0)
  const [isReady, setIsReady]         = useState(false)
  const [isCoverView, setIsCoverView] = useState(true)
  const [mode, setMode]               = useState<DeviceMode>("desktop")
  const [resizeTick, setResizeTick]   = useState(0)

  // wrapRef: el div de React que actúa como contenedor
  // bookEl:  el div real que StPageFlip controla (creado manualmente, nunca por React)
  const wrapRef  = useRef<HTMLDivElement>(null)
  const bookEl   = useRef<HTMLDivElement | null>(null)
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
  // bookEl se crea aquí dentro, justo antes de usarlo,
  // para garantizar que wrapRef ya está montado.
  useEffect(() => {
    if (!manifest || !wrapRef.current) return

    let destroyed = false

    const init = async () => {
      // 1. Destruir instancia previa y limpiar DOM completamente
      if (flipRef.current) {
        try { flipRef.current.destroy() } catch (_) {}
        flipRef.current = null
      }

      // Crear el div aislado si no existe, o limpiar si ya existe
      const initialMode = getMode(window.innerWidth)
      const initialTransform = initialMode === "desktop" ? "translateX(-25%)" : "translateX(0)"

      if (!bookEl.current) {
        const div = document.createElement("div")
        div.style.cssText = `display:flex;align-items:center;justify-content:center;transform:${initialTransform};`
        wrapRef.current!.appendChild(div)
        bookEl.current = div
      } else {
        bookEl.current.innerHTML = ""
        // Resetear transform para portada al reinicializar
        bookEl.current.style.transform = initialTransform
      }

      const { PageFlip } = await import("page-flip")
      if (destroyed || !bookEl.current) return

      const { pages, format, basePath } = manifest
      const currentMode = getMode(window.innerWidth)
      setMode(currentMode)

      // 2. Leer aspect ratio real
      const { w: imgW, h: imgH } = await getImageSize(pageUrl(basePath, format, 1))
      if (destroyed || !bookEl.current) return
      const aspectRatio = imgW / imgH

      // 3. Calcular dimensiones según modo
      const vw        = window.innerWidth
      const vh        = window.innerHeight
      const navH      = currentMode === "mobile" ? 96 : 112
      const maxH      = vh - navH - 32
      const isDesktop = currentMode === "desktop"

      let pageW: number
      let pageH: number

      if (isDesktop) {
        pageH = maxH
        pageW = Math.round(pageH * aspectRatio)
        if (pageW * 2 > vw - 48) {
          pageW = Math.round((vw - 48) / 2)
          pageH = Math.round(pageW / aspectRatio)
        }
      } else {
        const widthFraction = currentMode === "mobile" ? 0.92 : 0.78
        pageW = Math.round(vw * widthFraction)
        pageH = Math.round(pageW / aspectRatio)
        if (pageH > maxH) {
          pageH = maxH
          pageW = Math.round(pageH * aspectRatio)
        }
      }

      // 4. Crear instancia PageFlip en el div aislado
      const pf = new PageFlip(bookEl.current!, {
        width:               pageW,
        height:              pageH,
        size:                "fixed" as SizeType,
        showCover:           true,
        drawShadow:          true,
        flippingTime:        isDesktop ? 700 : 500,
        usePortrait:         !isDesktop,
        autoSize:            false,
        maxShadowOpacity:    0.5,
        mobileScrollSupport: false,  // evita conflicto touch/scroll
      })

      // 5. Crear páginas HTML dentro del div aislado
      Array.from({ length: pages }, (_, i) => {
        const n       = i + 1
        const isFirst = n === 1
        const isLast  = n === pages

        const div = document.createElement("div")
        div.className = "pf-page"
        if (isFirst || isLast) div.setAttribute("data-density", "hard")

        const img = document.createElement("img")
        img.src           = pageUrl(basePath, format, n)
        img.alt           = isFirst ? "Portada" : isLast ? "Contraportada" : `Página ${n}`
        img.draggable     = false
        img.style.cssText = "width:100%;height:100%;object-fit:fill;display:block;"

        div.appendChild(img)
        bookEl.current!.appendChild(div)
      })

      pf.loadFromHTML(bookEl.current!.querySelectorAll(".pf-page"))

      // 6. Eventos
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("flip", (e: any) => {
        const idx     = e.data as number
        const isCover = idx === 0 || idx >= pages - 1
        setCurrentPage(idx)
        setIsCoverView(isCover)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("changeState", (_e: any) => {
        const idx     = pf.getCurrentPageIndex() as number
        const isCover = idx === 0 || idx >= pages - 1
        setIsCoverView(isCover)
      })

      flipRef.current = pf

      // Fade in suave
      if (bookEl.current) {
        bookEl.current.style.opacity    = "0"
        bookEl.current.style.transition = "opacity 0.4s ease"
        requestAnimationFrame(() => {
          if (bookEl.current) bookEl.current.style.opacity = "1"
        })
      }

      setIsReady(true)
    }

    init()

    return () => {
      destroyed = true
      if (flipRef.current) {
        try { flipRef.current.destroy() } catch (_) {}
        flipRef.current = null
      }
      // Limpiar el div aislado al desmontar
      if (bookEl.current) {
        bookEl.current.remove()
        bookEl.current = null
      }
      setIsReady(false)
    }
  }, [manifest, resizeTick])

  // ── Resize: reinicializar solo si cambia el modo ─────────────
  useEffect(() => {
    if (!manifest) return

    let lastMode = getMode(window.innerWidth)
    let timer: ReturnType<typeof setTimeout>

    const handleResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const newMode = getMode(window.innerWidth)
        if (newMode !== lastMode) {
          lastMode = newMode
          if (flipRef.current) {
            try { flipRef.current.destroy() } catch (_) {}
            flipRef.current = null
          }
          if (bookEl.current) bookEl.current.innerHTML = ""
          setIsReady(false)
          setResizeTick(t => t + 1)
        }
      }, 300)
    }

    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
      clearTimeout(timer)
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

  // ── Teclado (solo desktop) ───────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode !== "desktop") return
      if (e.key === "ArrowRight") goNext()
      if (e.key === "ArrowLeft")  goPrev()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [goNext, goPrev, mode])

  // ── Centrado de portada en desktop ───────────────────────────
  useEffect(() => {
    if (!bookEl.current || mode !== "desktop") return
    const transform = isCoverView
      ? (currentPage === 0 ? "translateX(-25%)" : "translateX(25%)")
      : "translateX(0)"
    bookEl.current.style.transform  = transform
    bookEl.current.style.transition = "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease"
  }, [isCoverView, currentPage, mode])

  // ── UI derivada ──────────────────────────────────────────────
  const totalPages       = manifest?.pages ?? 0
  const displayPage      = currentPage + 1
  const isFirstPage      = currentPage === 0
  const isLastPage       = currentPage >= totalPages - 1
  const progress         = totalPages > 1 ? (currentPage / (totalPages - 1)) * 100 : 0
  const isMobile         = mode === "mobile"
  const isMobileOrTablet = mode === "mobile" || mode === "tablet"

  // ── Error / Carga ────────────────────────────────────────────
  if (error) return (
    <div className="h-screen flex flex-col items-center justify-center bg-[#0a0a0a] gap-4 p-8">
      <div className="text-red-500 font-mono text-sm">⚠ Error al cargar el visor</div>
      <div className="text-gray-600 text-xs max-w-sm text-center">{error}</div>
      <div className="text-gray-700 text-xs mt-2 text-center">
        Asegúrate de correr:<br />
        <code className="text-gray-500 mt-1 block">node scripts/convert-pdf.mjs public/TuArchivo.pdf</code>
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
      {/* wrapRef es el único div que React controla.
          bookEl es un div hijo creado con JS puro — React no lo toca nunca. */}
      <div
        ref={wrapRef}
        className="flex-1 flex items-center justify-center overflow-hidden"
      >
        {!isReady && (
          <div className="absolute text-blue-500 font-mono text-sm tracking-widest animate-pulse z-10">
            PREPARANDO LIBRO...
          </div>
        )}
      </div>

      {/* ── BARRA DE NAVEGACIÓN ── */}
      <nav
        className={`
          bg-black/85 backdrop-blur-2xl border-t border-white/5
          flex items-center justify-between z-50
          ${isMobile ? "h-24 px-4" : "h-28 px-6 md:px-16"}
        `}
        aria-label="Navegación del libro"
      >
        {/* Portada — tablet y desktop */}
        {!isMobile && (
          <div className="flex-1 flex">
            <button
              onClick={goFirst}
              disabled={isFirstPage}
              className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 transition-all text-[10px] uppercase tracking-[0.2em] text-gray-500 hover:text-white"
            >
              Portada
            </button>
          </div>
        )}

        {/* Controles centrales */}
        <div className="flex flex-col items-center gap-2 flex-1">
          <div className={`flex items-center ${isMobile ? "gap-6 w-full justify-between px-2" : "gap-8 md:gap-12"}`}>

            <button
              onClick={goPrev}
              disabled={isFirstPage}
              className={`flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90 ${isMobile ? "w-14 h-14" : "w-12 h-12"}`}
              aria-label="Página anterior"
            >
              <span className={isMobile ? "text-2xl" : "text-xl"}>❮</span>
            </button>

            <div className="flex flex-col items-center min-w-[90px]">
              <div className={`font-light tracking-tighter ${isMobile ? "text-xl" : "text-2xl"}`}>
                <span className="text-blue-500 font-bold">{displayPage}</span>
                <span className="text-gray-600"> / {totalPages}</span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-[9px] text-gray-700 mt-1 font-mono uppercase tracking-wider">
                {isMobileOrTablet ? "desliza para pasar" : isCoverView ? "portada" : "doble página"}
              </span>
            </div>

            <button
              onClick={goNext}
              disabled={isLastPage}
              className={`flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90 ${isMobile ? "w-14 h-14" : "w-12 h-12"}`}
              aria-label="Página siguiente"
            >
              <span className={isMobile ? "text-2xl" : "text-xl"}>❯</span>
            </button>
          </div>

          {/* Dots de progreso — móvil y tablet */}
          {isMobileOrTablet && totalPages > 0 && (
            <div className="flex gap-1.5 mt-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const dotPage = Math.round((i / Math.max(Math.min(totalPages, 7) - 1, 1)) * (totalPages - 1))
                const isActive = Math.abs(dotPage - currentPage) < Math.ceil(totalPages / 7)
                return (
                  <div
                    key={i}
                    className={`rounded-full transition-all duration-300 ${isActive ? "w-4 h-1.5 bg-blue-500" : "w-1.5 h-1.5 bg-white/20"}`}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* Badge — solo desktop */}
        {!isMobileOrTablet && (
          <div className="flex-1 flex justify-end">
            <div className="text-[9px] text-gray-800 border border-gray-800/50 px-2 py-1 rounded">
              FLIP ENGINE V6.1
            </div>
          </div>
        )}
      </nav>
    </div>
  )
}
