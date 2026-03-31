"use client"

/**
 * FlipBook.tsx — v7.0
 * ─────────────────────────────────────────────────────────────────
 * Novedades v7:
 *  - Zoom: doble clic/tap + botones +/- (100% → 150% → 200%)
 *  - Fullscreen: botón + tecla F (desktop)
 *  - Sonido: página volteando (inicio drag + flip completo)
 *  - Botón mute/unmute en barra de navegación
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

type DeviceMode = "mobile" | "tablet" | "desktop"

// ─── Constantes ───────────────────────────────────────────────────
const ZOOM_STEPS   = [1, 1.5, 2]      // 100%, 150%, 200%
const ZOOM_LABELS  = ["100%", "150%", "200%"]

// ─── Utilidades ───────────────────────────────────────────────────
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

  // ── Zoom ──────────────────────────────────────────────────────
  const [zoomIdx, setZoomIdx]         = useState(0)   // índice en ZOOM_STEPS

  // ── Fullscreen ────────────────────────────────────────────────
  const [isFullscreen, setIsFullscreen] = useState(false)

  // ── Sonido ────────────────────────────────────────────────────
  const [isMuted, setIsMuted]           = useState(false)
  const isMutedRef = useRef(false)      // ref para acceder en closures sin recrear playSound
  const audioFlip = useRef<HTMLAudioElement | null>(null)
  const audioDrag = useRef<HTMLAudioElement | null>(null)
  // Flag para evitar reproducir drag si ya está en progreso
  const isDragging = useRef(false)

  // ── Pan (arrastre cuando hay zoom) ───────────────────────────
  const isPanning   = useRef(false)
  const panStart    = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 })

  const wrapRef  = useRef<HTMLDivElement>(null)
  const bookEl   = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipRef  = useRef<any>(null)

  // ── Inicializar audios ───────────────────────────────────────
  useEffect(() => {
    audioFlip.current = new Audio("/sounds/page-flip.mp3")
    audioDrag.current = new Audio("/sounds/page-drag.mp3")
    audioFlip.current.volume = 0.7
    audioDrag.current.volume = 0.35
    return () => {
      audioFlip.current = null
      audioDrag.current = null
    }
  }, [])

  // Mantener ref sincronizado con estado para uso en closures
  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  // ── Helper: reproducir sonido (usa ref, no estado) ───────────
  const playSound = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio || isMutedRef.current) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }, [])

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
    if (!manifest || !wrapRef.current) return

    let destroyed = false

    const init = async () => {
      if (flipRef.current) {
        try { flipRef.current.destroy() } catch (_) {}
        flipRef.current = null
      }

      const initialMode      = getMode(window.innerWidth)
      const initialTransform = initialMode === "desktop" ? "translateX(-25%)" : "translateX(0)"

      if (!bookEl.current) {
        const div = document.createElement("div")
        div.style.cssText = `display:flex;align-items:center;justify-content:center;transform:${initialTransform};transform-origin:center center;`
        wrapRef.current!.appendChild(div)
        bookEl.current = div
      } else {
        bookEl.current.innerHTML = ""
        bookEl.current.style.transform = initialTransform
      }

      const { PageFlip } = await import("page-flip")
      if (destroyed || !bookEl.current) return

      const { pages, format, basePath } = manifest
      const currentMode = getMode(window.innerWidth)
      setMode(currentMode)

      const { w: imgW, h: imgH } = await getImageSize(pageUrl(basePath, format, 1))
      if (destroyed || !bookEl.current) return
      const aspectRatio = imgW / imgH

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
        mobileScrollSupport: false,
      })

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

      // ── Eventos StPageFlip ───────────────────────────────────
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("flip", (e: any) => {
        const idx     = e.data as number
        const isCover = idx === 0 || idx >= pages - 1
        setCurrentPage(idx)
        setIsCoverView(isCover)
        setZoomIdx(0)   // resetear zoom al pasar página
        isDragging.current = false
        // Sonido flip completo
        playSound(audioFlip.current)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("changeState", (e: any) => {
        const idx     = pf.getCurrentPageIndex() as number
        const isCover = idx === 0 || idx >= pages - 1
        setIsCoverView(isCover)

        // Sonido al iniciar el drag (estado "user_fold")
        if (e.data === "user_fold" && !isDragging.current) {
          isDragging.current = true
          playSound(audioDrag.current)
        }
        if (e.data === "read") {
          isDragging.current = false
        }
      })

      flipRef.current = pf

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
      if (bookEl.current) {
        bookEl.current.remove()
        bookEl.current = null
      }
      setIsReady(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, resizeTick])

  // ── Resize ───────────────────────────────────────────────────
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
          setZoomIdx(0)
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

  // ── Zoom ─────────────────────────────────────────────────────
  const applyZoom = useCallback((idx: number) => {
    if (!bookEl.current) return
    const scale = ZOOM_STEPS[idx]

    if (idx === 0) {
      // Sin zoom: volver al centrado normal
      const isCover_ = flipRef.current
        ? (flipRef.current.getCurrentPageIndex() === 0 ||
           flipRef.current.getCurrentPageIndex() >= (manifest?.pages ?? 1) - 1)
        : true
      const baseX = mode === "desktop" && isCover_
        ? (flipRef.current?.getCurrentPageIndex() === 0 ? "-25%" : "25%")
        : "0"
      bookEl.current.style.transform       = `translateX(${baseX}) scale(1)`
      bookEl.current.style.transformOrigin = "center center"
      bookEl.current.style.margin          = "auto"
      bookEl.current.style.marginLeft      = "auto"
      bookEl.current.style.marginTop       = "auto"
      bookEl.current.style.translate       = "0px 0px"
    } else {
      // Con zoom: centrado, pan libre con translate
      bookEl.current.style.transform       = `scale(${scale})`
      bookEl.current.style.transformOrigin = "center center"
      bookEl.current.style.translate       = "0px 0px"
      bookEl.current.style.margin          = "auto"
    }
    bookEl.current.style.transition = "transform 0.3s cubic-bezier(0.4,0,0.2,1)"
  }, [mode, manifest])

  // Bloquear/desbloquear flip en StPageFlip según zoom
  const setFlipLocked = useCallback((locked: boolean) => {
    if (!flipRef.current) return
    try {
      // StPageFlip expone el renderer — podemos deshabilitar los eventos touch/mouse
      // La forma más limpia es usar el método oficial si existe, o el overlay
      if (locked) {
        flipRef.current.flipNext = () => {}
        flipRef.current.flipPrev = () => {}
      }
    } catch (_) {}
  }, [])

  const zoomIn = useCallback(() => {
    setZoomIdx(prev => {
      const next = Math.min(prev + 1, ZOOM_STEPS.length - 1)
      applyZoom(next)
      return next
    })
  }, [applyZoom])

  const zoomOut = useCallback(() => {
    setZoomIdx(prev => {
      const next = Math.max(prev - 1, 0)
      applyZoom(next)
      return next
    })
  }, [applyZoom])

  const zoomToggle = useCallback(() => {
    setZoomIdx(prev => {
      const next = (prev + 1) % ZOOM_STEPS.length
      applyZoom(next)
      return next
    })
  }, [applyZoom])

  // Doble clic/tap sobre el área del libro
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      // Solo si el clic fue sobre el libro (no la barra nav)
      if (e.target === el || el.contains(e.target as Node)) {
        zoomToggle()
      }
    }
    el.addEventListener("dblclick", handler)
    return () => el.removeEventListener("dblclick", handler)
  }, [zoomToggle])

  // ── Centrado portada (solo cuando NO hay zoom) ───────────────
  useEffect(() => {
    if (!bookEl.current || mode !== "desktop" || zoomIdx > 0) return
    const baseX = isCoverView
      ? (currentPage === 0 ? "-25%" : "25%")
      : "0"
    bookEl.current.style.transform       = `translateX(${baseX}) scale(1)`
    bookEl.current.style.transformOrigin = "center center"
    bookEl.current.style.transition      = "transform 0.5s cubic-bezier(0.4,0,0.2,1), opacity 0.4s ease"
  }, [isCoverView, currentPage, mode, zoomIdx])

  // ── Fullscreen ───────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])

  useEffect(() => {
    const handler = () => {
      const isFull = !!document.fullscreenElement
      setIsFullscreen(isFull)
      // Guardar página actual antes de reinicializar
      const savedPage = flipRef.current ? flipRef.current.getCurrentPageIndex() : 0
      setTimeout(() => {
        if (bookEl.current) bookEl.current.innerHTML = ""
        setIsReady(false)
        setZoomIdx(0)
        setResizeTick(t => t + 1)
        // Restaurar página después de reinicializar
        setTimeout(() => {
          if (flipRef.current && savedPage > 0) {
            flipRef.current.turnToPage(savedPage)
            setCurrentPage(savedPage)
            const total = flipRef.current.getPageCount()
            setIsCoverView(savedPage === 0 || savedPage >= total - 1)
          }
        }, 800)
      }, 300)
    }
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  // ── Teclado ──────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode !== "desktop") return
      // Navegación solo disponible sin zoom
      if (e.key === "ArrowRight" && zoomIdx === 0) flipRef.current?.flipNext("bottom")
      if (e.key === "ArrowLeft"  && zoomIdx === 0) flipRef.current?.flipPrev("bottom")
      if (e.key === "f" || e.key === "F") toggleFullscreen()
      if (e.key === "+" || e.key === "=") zoomIn()
      if (e.key === "-") zoomOut()
      // Escape para salir del zoom
      if (e.key === "Escape" && zoomIdx > 0) {
        setZoomIdx(0)
        applyZoom(0)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [mode, toggleFullscreen, zoomIn, zoomOut, zoomIdx, applyZoom])

  // ── Navegación ───────────────────────────────────────────────
  const goNext = useCallback(() => flipRef.current?.flipNext("bottom"), [])
  const goPrev = useCallback(() => flipRef.current?.flipPrev("bottom"), [])
  const goFirst = useCallback(() => {
    flipRef.current?.turnToPage(0)
    setCurrentPage(0)
    setIsCoverView(true)
    setZoomIdx(0)
  }, [])

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
    </div>
  )

  if (!manifest) return (
    <div className="h-screen flex items-center justify-center bg-[#0a0a0a] text-blue-500 font-mono tracking-widest animate-pulse">
      CARGANDO...
    </div>
  )

  // ── Íconos SVG inline ────────────────────────────────────────
  const IconFullscreen = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      {isFullscreen
        ? <path d="M6 1v5H1M9 1v5h5M1 9h5v5M9 14v-5h5"/>
        : <path d="M1 5V1h4M10 1h4v4M14 10v4h-4M5 14H1v-4"/>
      }
    </svg>
  )

  const IconVolume = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {isMuted
        ? <><path d="M1 5h3l4-3v11l-4-3H1z"/><path d="M13 5l-4 5M9 5l4 5"/></>
        : <><path d="M1 5h3l4-3v11l-4-3H1z"/><path d="M11 4a5 5 0 010 7"/><path d="M13 2a8 8 0 010 11"/></>
      }
    </svg>
  )

  // ── Render ───────────────────────────────────────────────────
  return (
    <div
      className="w-full h-screen flex flex-col bg-[#0d0d0d] overflow-hidden select-none text-white"
      role="region"
      aria-label={title ?? manifest.name}
    >
      {/* ── ÁREA DEL LIBRO ── */}
      <div
        ref={wrapRef}
        className="flex-1 flex items-center justify-center"
        style={{ position: "relative", overflow: "hidden" }}
      >
        {/* Overlay de pan — cubre todo el libro cuando hay zoom
            bloqueando el flip de StPageFlip completamente. */}
        {zoomIdx > 0 && (
          <div
            style={{
              position:  "absolute",
              inset:     0,
              zIndex:    30,
              cursor:    isPanning.current ? "grabbing" : "grab",
            }}
            onMouseDown={(e) => {
              isPanning.current = true
              panStart.current  = {
                x:       e.clientX,
                y:       e.clientY,
                scrollX: parseFloat(bookEl.current?.style.translate?.split(" ")[0] || "0"),
                scrollY: parseFloat(bookEl.current?.style.translate?.split(" ")[1] || "0"),
              }
              e.preventDefault()
            }}
            onMouseMove={(e) => {
              if (!isPanning.current || !bookEl.current) return
              const dx = panStart.current.scrollX + (e.clientX - panStart.current.x)
              const dy = panStart.current.scrollY + (e.clientY - panStart.current.y)
              // Usar translate en vez de margin para no romper el layout
              const scale = ZOOM_STEPS[zoomIdx]
              bookEl.current.style.transform = `scale(${scale})`
              bookEl.current.style.translate = `${dx}px ${dy}px`
            }}
            onMouseUp={() => { isPanning.current = false }}
            onMouseLeave={() => { isPanning.current = false }}
            onTouchStart={(e) => {
              isPanning.current = true
              panStart.current  = {
                x:       e.touches[0].clientX,
                y:       e.touches[0].clientY,
                scrollX: parseFloat(bookEl.current?.style.translate?.split(" ")[0] || "0"),
                scrollY: parseFloat(bookEl.current?.style.translate?.split(" ")[1] || "0"),
              }
            }}
            onTouchMove={(e) => {
              if (!isPanning.current || !bookEl.current) return
              e.preventDefault()
              const dx = panStart.current.scrollX + (e.touches[0].clientX - panStart.current.x)
              const dy = panStart.current.scrollY + (e.touches[0].clientY - panStart.current.y)
              const scale = ZOOM_STEPS[zoomIdx]
              bookEl.current.style.transform = `scale(${scale})`
              bookEl.current.style.translate = `${dx}px ${dy}px`
            }}
            onTouchEnd={() => { isPanning.current = false }}
          />
        )}
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
        {/* Izquierda: portada (tablet/desktop) */}
        {!isMobile && (
          <div className="flex-1 flex items-center gap-3">
            <button
              onClick={goFirst}
              disabled={isFirstPage}
              className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-30 transition-all text-[10px] uppercase tracking-[0.2em] text-gray-500 hover:text-white"
            >
              Portada
            </button>
          </div>
        )}

        {/* Centro: navegación + zoom */}
        <div className="flex flex-col items-center gap-2 flex-1">
          <div className={`flex items-center ${isMobile ? "gap-4 w-full justify-between px-1" : "gap-4 md:gap-6"}`}>

            <button
              onClick={goPrev}
              disabled={isFirstPage || zoomIdx > 0}
              className={`flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90 ${isMobile ? "w-14 h-14" : "w-12 h-12"}`}
              aria-label="Página anterior"
              title={zoomIdx > 0 ? "Reduce el zoom para navegar" : ""}
            >
              <span className={isMobile ? "text-2xl" : "text-xl"}>❮</span>
            </button>

            {/* Contador */}
            <div className="flex flex-col items-center min-w-[80px]">
              <div className={`font-light tracking-tighter ${isMobile ? "text-xl" : "text-2xl"}`}>
                <span className="text-blue-500 font-bold">{displayPage}</span>
                <span className="text-gray-600"> / {totalPages}</span>
              </div>
              <div className="w-full h-1 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-[9px] text-gray-700 mt-1 font-mono uppercase tracking-wider">
                {zoomIdx > 0 ? "arrastra para mover · esc para salir" : isMobileOrTablet ? "desliza para pasar" : isCoverView ? "portada" : "doble página"}
              </span>
            </div>

            <button
              onClick={goNext}
              disabled={isLastPage || zoomIdx > 0}
              className={`flex items-center justify-center rounded-2xl bg-white/5 border border-white/10 hover:bg-blue-600 disabled:opacity-0 transition-all active:scale-90 ${isMobile ? "w-14 h-14" : "w-12 h-12"}`}
              aria-label="Página siguiente"
              title={zoomIdx > 0 ? "Reduce el zoom para navegar" : ""}
            >
              <span className={isMobile ? "text-2xl" : "text-xl"}>❯</span>
            </button>

            {/* Separador */}
            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />

            {/* Grupo zoom */}
            <div className="hidden sm:flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl px-2 py-1">
              <button
                onClick={zoomOut}
                disabled={zoomIdx === 0}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all text-lg font-light"
                aria-label="Reducir zoom"
              >
                −
              </button>
              <span className="text-[11px] font-mono text-gray-400 min-w-[38px] text-center">
                {ZOOM_LABELS[zoomIdx]}
              </span>
              <button
                onClick={zoomIn}
                disabled={zoomIdx === ZOOM_STEPS.length - 1}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 disabled:opacity-30 transition-all text-lg font-light"
                aria-label="Aumentar zoom"
              >
                +
              </button>
            </div>

          </div>

          {/* Dots móvil/tablet */}
          {isMobileOrTablet && totalPages > 0 && (
            <div className="flex gap-1.5 mt-1">
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                const dotPage  = Math.round((i / Math.max(Math.min(totalPages, 7) - 1, 1)) * (totalPages - 1))
                const isActive = Math.abs(dotPage - currentPage) < Math.ceil(totalPages / 7)
                return (
                  <div key={i} className={`rounded-full transition-all duration-300 ${isActive ? "w-4 h-1.5 bg-blue-500" : "w-1.5 h-1.5 bg-white/20"}`} />
                )
              })}
            </div>
          )}
        </div>

        {/* Derecha: mute + fullscreen */}
        <div className={`flex items-center gap-2 ${isMobile ? "" : "flex-1 justify-end"}`}>

          {/* Mute / Unmute */}
          <button
            onClick={() => setIsMuted(m => !m)}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${
              isMuted
                ? "bg-white/5 border-white/10 text-gray-600 hover:text-gray-400"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
            }`}
            aria-label={isMuted ? "Activar sonido" : "Silenciar"}
            title={isMuted ? "Activar sonido" : "Silenciar"}
          >
            <IconVolume />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:text-white transition-all"
            aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
            title={`Pantalla completa ${mode === "desktop" ? "(F)" : ""}`}
          >
            <IconFullscreen />
          </button>

          {/* Badge versión — solo desktop */}
          {!isMobileOrTablet && (
            <div className="text-[9px] text-gray-800 border border-gray-800/50 px-2 py-1 rounded ml-1">
              V7.0
            </div>
          )}

        </div>
      </nav>
    </div>
  )
}
