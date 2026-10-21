"use client"

/**
 * FlipBook.tsx — v7.3 (ZOOM FIX - SIN updateSize)
 * ─────────────────────────────────────────────────────────────────
 * Fix: Zoom centrado usando solo CSS, sin métodos del PageFlip
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useCallback } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { library } from "@fortawesome/fontawesome-svg-core"
import { faDownload } from "@fortawesome/free-solid-svg-icons"
import type { SizeType } from "page-flip"

library.add(faDownload)
import type { Manifest } from "@/types/overlay"
import { buildOverlayElement, buildRevealHotspot, buildVideoElement, createOverlayRegistry, disposeOverlayRegistry, pauseAllAudio, pauseAllVideos } from "@/lib/overlay-render"

interface FlipBookProps {
  manifest: string | Manifest
  title?: string
  embedded?: boolean
}

type DeviceMode = "mobile" | "tablet" | "desktop"

const ZOOM_STEPS   = [1, 1.5, 2]
const ZOOM_LABELS  = ["100%", "150%", "200%"]

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

export default function FlipBook({ manifest: source, title, embedded = false }: FlipBookProps) {
  const [loaded, setLoaded] = useState<{ source: string; value: Manifest } | null>(null)
  const manifest = typeof source === "object" ? source : loaded?.source === source ? loaded.value : null
  const [error, setError] = useState<{ source: string | Manifest; message: string } | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const [currentPage, setCurrentPage] = useState(0)
  const [isReady, setIsReady]         = useState(false)
  const [isCoverView, setIsCoverView] = useState(true)
  const [mode, setMode]               = useState<DeviceMode>("desktop")
  const [resizeTick, setResizeTick]   = useState(0)
  const [zoomIdx, setZoomIdx]         = useState(0)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMuted, setIsMuted]           = useState(false)
  const [tocOpen, setTocOpen]           = useState(false)
  
  const isMutedRef = useRef(false)
  const audioFlip = useRef<HTMLAudioElement | null>(null)
  const audioDrag = useRef<HTMLAudioElement | null>(null)
  const isDragging = useRef(false)
  const isPanning   = useRef(false)
  const panStart    = useRef({ x: 0, y: 0, scrollX: 0, scrollY: 0 })
  const wrapRef  = useRef<HTMLDivElement>(null)
  const bookEl   = useRef<HTMLDivElement | null>(null)
  const savedPageRef = useRef(0)
  const initializedManifest = useRef<Manifest | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flipRef  = useRef<any>(null)

  useEffect(() => {
    audioFlip.current = new Audio("/sounds/page-flip.mp3")
    audioDrag.current = new Audio("/sounds/page-drag.mp3")
    audioFlip.current.volume = 0.7
    audioDrag.current.volume = 0.35
    return () => {
      audioFlip.current?.pause()
      audioDrag.current?.pause()
      audioFlip.current = null
      audioDrag.current = null
    }
  }, [])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  const playSound = useCallback((audio: HTMLAudioElement | null) => {
    if (!audio || isMutedRef.current) return
    audio.currentTime = 0
    audio.play().catch(() => {})
  }, [])

  // ─── FUNCIÓN CLAVE: Aplicar zoom con CSS puro ─────────────────
  const applyZoom = useCallback(() => {
    if (!bookEl.current || !flipRef.current) return
    
    const scale = ZOOM_STEPS[zoomIdx]
    const isCover = currentPage === 0 || currentPage >= (manifest?.pages ?? 1) - 1
    
    if (zoomIdx === 0) {
  // SIN ZOOM: comportamiento original CON transición suave
  const baseX = mode === "desktop" && isCover
    ? (currentPage === 0 ? "-25%" : "25%")
    : "0"
    
  bookEl.current.style.transition = "transform 0.3s cubic-bezier(0.4,0,0.2,1)"
  bookEl.current.style.transform = `translateX(${baseX}) scale(1)`
  bookEl.current.style.translate = "0px 0px"
  bookEl.current.style.width = ""
  bookEl.current.style.marginLeft = ""
  
} else {
  // CON ZOOM: mismo criterio de porcentaje que sin zoom.
  // El % se resuelve sobre el bounding box propio del elemento (no cambia con scale),
  // así que queda centrado en cualquier nivel de zoom sin recalcular en px.
  const baseX = mode === "desktop" && isCover
    ? (currentPage === 0 ? "-25%" : "25%")
    : "0"

  // SIN TRANSICIÓN: aplicar inmediatamente para evitar el "salto" lateral
  bookEl.current.style.transition = "none"
  bookEl.current.style.transform = `translateX(${baseX}) scale(${scale})`
  bookEl.current.style.translate = "0px 0px"
}
    
    bookEl.current.style.transformOrigin = "center center"
    bookEl.current.style.transition = "transform 0.3s cubic-bezier(0.4,0,0.2,1)"
  }, [zoomIdx, currentPage, mode, manifest])

  // Aplicar zoom cuando cambia
  useEffect(() => {
    if (isReady) {
      applyZoom()
    }
  }, [applyZoom, isReady])

  useEffect(() => {
    if (typeof source !== "string") return
    const controller = new AbortController()
    let active = true
    fetch(source, { signal: controller.signal })
      .then(r => {
        if (!r.ok) throw new Error(`No se pudo cargar: ${r.status}`)
        return r.json()
      })
      .then(value => {
        if (active) setLoaded({ source, value })
      })
      .catch(e => {
        if (active) setError({ source, message: e instanceof Error ? e.message : "Error al cargar el manifiesto" })
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [source, reloadTick])

  useEffect(() => {
    if (!manifest || !wrapRef.current) return
    if (initializedManifest.current !== manifest) {
      savedPageRef.current = 0
      initializedManifest.current = manifest
    }

    let destroyed = false
    const overlayRegistry = createOverlayRegistry()
    let pageFlip: import("page-flip").PageFlip | null = null
    const dispose = () => {
      disposeOverlayRegistry(overlayRegistry)
      audioFlip.current?.pause()
      audioDrag.current?.pause()
      isDragging.current = false
      isPanning.current = false
      if (pageFlip) {
        try { pageFlip.destroy() } catch { /* Already detached by PageFlip. */ }
        if (flipRef.current === pageFlip) flipRef.current = null
        pageFlip = null
      }
      bookEl.current?.remove()
      bookEl.current = null
    }

    const init = async () => {
      const initialMode = getMode(window.innerWidth)
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

      const maxW      = Math.max(1, wrapRef.current!.clientWidth - 32)
      const maxH      = Math.max(1, wrapRef.current!.clientHeight - 32)
      const isDesktop = currentMode === "desktop"

      let pageW: number
      let pageH: number

      if (isDesktop) {
        pageH = maxH
        pageW = Math.round(pageH * aspectRatio)
        if (pageW * 2 > maxW) {
          pageW = Math.max(1, Math.floor(maxW / 2))
          pageH = Math.round(pageW / aspectRatio)
        }
      } else {
        const widthFraction = currentMode === "mobile" ? 0.92 : 0.78
        pageW = Math.max(1, Math.round(maxW * widthFraction))
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
        // Desactiva la esquina "sensible" que gana el clic contra overlays
        // ubicados cerca del borde (ej: un botón en la esquina inferior).
        // El arrastre normal para pasar de página en cualquier otra parte
        // de la hoja sigue funcionando igual.
        showPageCorners:     false,
      })
      pageFlip = pf

      Array.from({ length: pages }, (_, i) => {
        const n       = i + 1
        const isFirst = n === 1
        const isLast  = n === pages

        const div = document.createElement("div")
        div.className = "pf-page"
        div.style.position = "relative" // necesario para posicionar overlays en absoluto encima
        if (isFirst || isLast) div.setAttribute("data-density", "hard")

        const img = document.createElement("img")
        img.src           = pageUrl(basePath, format, n)
        img.alt           = isFirst ? "Portada" : isLast ? "Contraportada" : `Página ${n}`
        img.draggable     = false
        img.style.cssText = "width:100%;height:100%;object-fit:fill;display:block;"

        div.appendChild(img)

        // Foto real de esta página (mismo tamaño/composición que la imagen de
        // fieltro), revelada por los hotspots tipo "reveal" con clip-path.
        const revealSrc = manifest.revealImages?.[String(n)]
        let revealImg: HTMLImageElement | null = null
        if (revealSrc) {
          revealImg = document.createElement("img")
          revealImg.src = revealSrc
          revealImg.draggable = false
          revealImg.alt = ""
          revealImg.style.cssText =
            "position:absolute;inset:0;width:100%;height:100%;object-fit:fill;display:block;" +
            "clip-path:circle(0% at 50% 50%);-webkit-clip-path:circle(0% at 50% 50%);" +
            "transition:clip-path .35s cubic-bezier(.34,1.4,.64,1);pointer-events:none;"
          div.appendChild(revealImg)
        }

        const pageOverlays = manifest.overlays?.[String(n)]
        pageOverlays?.forEach(overlay => {
          if (overlay.type === "reveal" && revealImg) {
            div.appendChild(buildRevealHotspot(overlay, revealImg, div, manifest.revealCardBg))
          } else if (overlay.type === "video") {
            div.appendChild(buildVideoElement(overlay, overlayRegistry))
          } else {
            div.appendChild(buildOverlayElement(overlay, overlayRegistry))
          }
        })

        bookEl.current!.appendChild(div)
      })

      pf.loadFromHTML(bookEl.current!.querySelectorAll(".pf-page"))
      const restoredPage = Math.max(0, Math.min(savedPageRef.current, pages - 1))
      if (restoredPage > 0) pf.turnToPage(restoredPage)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("flip", (e: any) => {
        if (destroyed) return
        const idx     = e.data as number
        const isCover = idx === 0 || idx >= pages - 1
        setCurrentPage(idx)
        setIsCoverView(isCover)
        setZoomIdx(0) // Resetear zoom al pasar página
        isDragging.current = false
        playSound(audioFlip.current)
        pauseAllVideos(overlayRegistry) // que ningún video siga sonando de fondo
        pauseAllAudio(overlayRegistry) // que ningún audio de botón siga sonando de fondo
        
        // Restaurar transform normal después del flip
        requestAnimationFrame(() => {
          if (!destroyed && bookEl.current) {
            const baseX = currentMode === "desktop" && isCover
              ? (idx === 0 ? "-25%" : "25%")
              : "0"
            bookEl.current.style.transform = `translateX(${baseX}) scale(1)`
            bookEl.current.style.translate = "0px 0px"
            bookEl.current.style.width = ""
          }
        })
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      pf.on("changeState", (e: any) => {
        if (destroyed) return
        const idx     = pf.getCurrentPageIndex() as number
        const isCover = idx === 0 || idx >= pages - 1
        setIsCoverView(isCover)

        if (e.data === "user_fold" && !isDragging.current) {
          isDragging.current = true
          playSound(audioDrag.current)
        }
        if (e.data === "read") {
          isDragging.current = false
        }
      })

      flipRef.current = pf
      setCurrentPage(restoredPage)
      setIsCoverView(restoredPage === 0 || restoredPage >= pages - 1)
      setZoomIdx(0)

      if (bookEl.current) {
        bookEl.current.style.opacity    = "0"
        bookEl.current.style.transition = "opacity 0.4s ease"
        requestAnimationFrame(() => {
          if (!destroyed && bookEl.current) bookEl.current.style.opacity = "1"
        })
      }

      setIsReady(true)
    }

    init().catch(e => {
      if (destroyed) return
      destroyed = true
      dispose()
      setIsReady(false)
      setError({ source, message: e instanceof Error ? e.message : "No se pudo preparar el libro" })
    })

    return () => {
      destroyed = true
      dispose()
      setIsReady(false)
    }
  }, [manifest, source, resizeTick, reloadTick, playSound])

  useEffect(() => {
    if (!manifest || !wrapRef.current) return
    const wrap = wrapRef.current
    let lastMode = getMode(window.innerWidth)
    let lastWidth = wrap.clientWidth
    let lastHeight = wrap.clientHeight
    let timer: ReturnType<typeof setTimeout>

    const handleResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        const newMode = getMode(window.innerWidth)
        const width = wrap.clientWidth
        const height = wrap.clientHeight
        if (newMode !== lastMode || width !== lastWidth || height !== lastHeight) {
          lastMode = newMode
          lastWidth = width
          lastHeight = height
          savedPageRef.current = flipRef.current?.getCurrentPageIndex() ?? 0
          setIsReady(false)
          setZoomIdx(0)
          setResizeTick(t => t + 1)
        }
      }, 300)
    }

    window.addEventListener("resize", handleResize)
    const observer = new ResizeObserver(handleResize)
    observer.observe(wrap)
    return () => {
      observer.disconnect()
      window.removeEventListener("resize", handleResize)
      clearTimeout(timer)
    }
  }, [manifest, reloadTick])

  const zoomIn = useCallback(() => {
    setZoomIdx(prev => Math.min(prev + 1, ZOOM_STEPS.length - 1))
  }, [])

  const zoomOut = useCallback(() => {
    setZoomIdx(prev => Math.max(prev - 1, 0))
  }, [])

  const zoomToggle = useCallback(() => {
    setZoomIdx(prev => (prev + 1) % ZOOM_STEPS.length)
  }, [])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const handler = (e: MouseEvent) => {
      if (e.target === el || el.contains(e.target as Node)) {
        zoomToggle()
      }
    }
    el.addEventListener("dblclick", handler)
    return () => el.removeEventListener("dblclick", handler)
  }, [zoomToggle, manifest, reloadTick])

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
    }
    document.addEventListener("fullscreenchange", handler)
    return () => document.removeEventListener("fullscreenchange", handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (mode !== "desktop") return
      
      if (e.key === "ArrowRight" && zoomIdx === 0) flipRef.current?.flipNext("bottom")
      if (e.key === "ArrowLeft"  && zoomIdx === 0) flipRef.current?.flipPrev("bottom")
      if (e.key === "f" || e.key === "F") toggleFullscreen()
      if (e.key === "+" || e.key === "=") zoomIn()
      if (e.key === "-") zoomOut()
      
      if (e.key === "Escape" && zoomIdx > 0) {
        setZoomIdx(0)
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [mode, toggleFullscreen, zoomIn, zoomOut, zoomIdx])

  const goNext = useCallback(() => flipRef.current?.flipNext("bottom"), [])
  const goPrev = useCallback(() => flipRef.current?.flipPrev("bottom"), [])
  const goFirst = useCallback(() => {
    flipRef.current?.turnToPage(0)
    setCurrentPage(0)
    setIsCoverView(true)
    setZoomIdx(0)
  }, [])

  const goToTocPage = useCallback((page: number) => {
    const totalPages = manifest?.pages ?? 1
    const idx = Math.max(0, Math.min(totalPages - 1, page - 1))
    flipRef.current?.turnToPage(idx)
    setCurrentPage(idx)
    setIsCoverView(idx === 0)
    setZoomIdx(0)
    setTocOpen(false)
  }, [manifest])

  const totalPages       = manifest?.pages ?? 0
  const displayPage      = currentPage + 1
  const isFirstPage      = currentPage === 0
  const isLastPage       = currentPage >= totalPages - 1
  const progress         = totalPages > 1 ? (currentPage / (totalPages - 1)) * 100 : 0
  const isMobile         = mode === "mobile"
  const isMobileOrTablet = mode === "mobile" || mode === "tablet"

  const rootHeight = embedded ? "h-full min-h-0" : "h-screen"

  if (error?.source === source) return (
    <div className={`${rootHeight} flex flex-col items-center justify-center bg-[#0a0a0a] gap-4 p-8`}>
      <div className="text-red-500 font-mono text-sm">⚠ Error al cargar el visor</div>
      <div className="text-gray-600 text-xs max-w-sm text-center">{error.message}</div>
      <button className="text-blue-500 text-sm" onClick={() => {
        setError(null)
        setLoaded(null)
        savedPageRef.current = 0
        setReloadTick(t => t + 1)
      }}>Reintentar</button>
    </div>
  )

  if (!manifest) return (
    <div className={`${rootHeight} flex items-center justify-center bg-[#0a0a0a] text-blue-500 font-mono tracking-widest animate-pulse`}>
      CARGANDO...
    </div>
  )

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

  const IconList = () => (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M1 3h13M1 7.5h13M1 12h13"/>
    </svg>
  )

  return (
    <div
      className={`relative w-full ${rootHeight} flex flex-col bg-[#0d0d0d] overflow-hidden select-none text-white`}
      role="region"
      aria-label={title ?? manifest.name}
    >
      <div
        ref={wrapRef}
        className="flex-1 min-h-0 min-w-0 flex items-center justify-center"
        style={{ position: "relative", overflow: "hidden" }}
      >
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
              if (!isPanning.current || !bookEl.current || !wrapRef.current) return
              
              const scale     = ZOOM_STEPS[zoomIdx]
              const bookW     = bookEl.current.offsetWidth
              const bookH     = bookEl.current.offsetHeight
              const wrapW     = wrapRef.current.offsetWidth
              const wrapH     = wrapRef.current.offsetHeight
              
              const EXTRA = 0.15
              const maxX = Math.max(0, (bookW * scale - wrapW) / 2) + bookW * EXTRA
              const maxY = Math.max(0, (bookH * scale - wrapH) / 2) + bookH * EXTRA
              
              const rawDx = panStart.current.scrollX + (e.clientX - panStart.current.x)
              const rawDy = panStart.current.scrollY + (e.clientY - panStart.current.y)
              
              const dx = Math.min(maxX, Math.max(-maxX, rawDx))
              const dy = Math.min(maxY, Math.max(-maxY, rawDy))
              
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
              if (!isPanning.current || !bookEl.current || !wrapRef.current) return
              e.preventDefault()
              
              const scale     = ZOOM_STEPS[zoomIdx]
              const bookW     = bookEl.current.offsetWidth
              const bookH     = bookEl.current.offsetHeight
              const wrapW     = wrapRef.current.offsetWidth
              const wrapH     = wrapRef.current.offsetHeight
              
              const EXTRA = 0.15
              const maxX = Math.max(0, (bookW * scale - wrapW) / 2) + bookW * EXTRA
              const maxY = Math.max(0, (bookH * scale - wrapH) / 2) + bookH * EXTRA
              
              const rawDx = panStart.current.scrollX + (e.touches[0].clientX - panStart.current.x)
              const rawDy = panStart.current.scrollY + (e.touches[0].clientY - panStart.current.y)
              
              const dx = Math.min(maxX, Math.max(-maxX, rawDx))
              const dy = Math.min(maxY, Math.max(-maxY, rawDy))
              
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

      <nav
        className={`
          bg-black/85 backdrop-blur-2xl border-t border-white/5
          flex shrink-0 items-center justify-between z-50
          ${isMobile ? "h-24 px-4" : "h-28 px-6 md:px-16"}
        `}
        aria-label="Navegación del libro"
      >
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

            <div className="flex flex-col items-center min-w-[80px]">
              <div className={`font-light tracking-tighter ${isMobile ? "text-xl" : "text-2xl"}`}>
                <span className="text-blue-500 font-bold">
                  {mode === "desktop" && !isCoverView && currentPage + 2 <= totalPages
                    ? `${displayPage}–${displayPage + 1}`
                    : displayPage
                  }
                </span>
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

            <div className="w-px h-6 bg-white/10 mx-1 hidden sm:block" />

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

        <div className={`flex items-center gap-2 ${isMobile ? "" : "flex-1 justify-end"}`}>

          <button
            onClick={() => setTocOpen(true)}
            disabled={!manifest?.tableOfContents?.length}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:bg-white/15 hover:text-white active:bg-blue-600 active:text-white disabled:opacity-30 transition-all"
            aria-label="Índice"
            title="Índice"
          >
            <IconList />
          </button>

          <button
            onClick={() => setIsMuted(m => !m)}
            className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all ${
              isMuted
                ? "bg-white/5 border-white/10 text-gray-600 hover:text-gray-400"
                : "bg-white/5 border-white/10 text-gray-400 hover:text-white"
            }`}
            aria-label={isMuted ? "Activar sonido" : "Silenciar"}
          >
            <IconVolume />
          </button>

          <button
            onClick={toggleFullscreen}
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:text-white transition-all"
            aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          >
            <IconFullscreen />
          </button>

          {!isMobileOrTablet && (
            <div className="text-[9px] text-gray-800 border border-gray-800/50 px-2 py-1 rounded ml-1">
              V7.3
            </div>
          )}

        </div>
      </nav>

      {manifest?.downloadPdfUrl && (
        <a
          href={manifest.downloadPdfUrl}
          download
          className={`${embedded ? "absolute" : "fixed"} left-4 z-50 flex items-center gap-2 rounded-full border border-white/10 bg-[#161616]/95 backdrop-blur px-4 py-2.5 text-xs text-gray-300 hover:bg-white/10 hover:text-white active:bg-blue-600 active:text-white shadow-lg transition-all ${
            isMobile ? "bottom-28" : "bottom-32"
          }`}
          aria-label="Descargar PDF"
          title="Descargar PDF"
        >
          <FontAwesomeIcon icon={faDownload} className="text-base" />
          {!isMobile && <span>Descargar PDF</span>}
        </a>
      )}

      {tocOpen && (
        <>
          {/* Backdrop: clic afuera cierra el panel sin navegar */}
          <div
            className={`${embedded ? "absolute" : "fixed"} inset-0 bg-black/50 z-40`}
            onClick={() => setTocOpen(false)}
          />

          {isMobileOrTablet ? (
            // Bottom sheet: sube desde abajo, cómodo para tocar con el dedo
            <div className={`${embedded ? "absolute max-h-[60%]" : "fixed max-h-[60vh]"} inset-x-0 bottom-0 z-50 bg-[#161616] border-t border-white/10 rounded-t-2xl flex flex-col`}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                <span className="text-sm font-semibold uppercase tracking-wider text-gray-300">Índice</span>
                <button
                  onClick={() => setTocOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 active:bg-blue-600 text-gray-400 hover:text-white transition-all"
                  aria-label="Cerrar índice"
                >
                  ✕
                </button>
              </div>
              <div className="overflow-y-auto px-3 py-2">
                {manifest?.tableOfContents?.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => goToTocPage(entry.page)}
                    className="w-full flex items-center justify-between gap-3 text-left px-3 py-3.5 rounded-xl hover:bg-white/10 active:bg-blue-600 transition-all"
                  >
                    <span className="text-[15px]">{entry.label}</span>
                    <span className="text-xs text-gray-500 font-mono shrink-0">pág. {entry.page}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Dropdown: se despliega hacia arriba desde el botón, en desktop
            <div className={`${embedded ? "absolute max-h-[60%] flex flex-col" : "fixed"} bottom-32 right-6 md:right-16 z-50 w-72 bg-[#161616] border border-white/10 rounded-2xl shadow-2xl overflow-hidden`}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-300">Índice</span>
                <button
                  onClick={() => setTocOpen(false)}
                  className="w-6 h-6 flex items-center justify-center rounded hover:bg-white/10 active:bg-blue-600 text-gray-400 hover:text-white transition-all"
                  aria-label="Cerrar índice"
                >
                  ✕
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto py-1.5">
                {manifest?.tableOfContents?.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => goToTocPage(entry.page)}
                    className="w-full flex items-center justify-between gap-3 text-left px-4 py-2.5 hover:bg-white/10 active:bg-blue-600 transition-all"
                  >
                    <span className="text-sm">{entry.label}</span>
                    <span className="text-[11px] text-gray-500 font-mono shrink-0">pág. {entry.page}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
