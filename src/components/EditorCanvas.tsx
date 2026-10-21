"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowPointer, faChevronLeft, faChevronRight, faHand, faPen, faPlay } from "@fortawesome/free-solid-svg-icons"
import { Rnd } from "react-rnd"
import type { Manifest, PageOverlay } from "@/types/overlay"
import { parseYouTubeId } from "@/lib/youtube"

interface Props {
  manifest: Manifest
  pageNum: number
  selectedId: string | null
  lockAspectRatio: boolean
  toolbarHost: HTMLElement | null
  suspended?: boolean
  onPageChange: (page: number) => void
  onSelect: (id: string | null) => void
  onChange: (id: string, patch: Partial<PageOverlay>) => void
}

export default function EditorCanvas({ manifest, pageNum, selectedId, lockAspectRatio, toolbarHost, suspended = false, onPageChange, onSelect, onChange }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const panStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const [viewport, setViewport] = useState({ w: 600, h: 800 })
  const [image, setImage] = useState({ src: "", w: 600, h: 800 })
  const [failedImage, setFailedImage] = useState("")
  const [zoom, setZoom] = useState<"page" | "width" | number>("page")
  const [panMode, setPanMode] = useState(false)
  const [preview, setPreview] = useState<{ page: number; id: string } | null>(null)
  const src = `${manifest.basePath}/page-${String(pageNum).padStart(3, "0")}.${manifest.format}`
  const ready = image.src === src
  const overlays = manifest.overlays?.[String(pageNum)] ?? []
  const selected = overlays.find((overlay) => overlay.id === selectedId)
  const previewId = !suspended && preview?.page === pageNum && preview.id === selectedId ? preview.id : null
  const validVideo = selected?.type === "video" && parseYouTubeId(selected.videoId ?? "")

  useEffect(() => {
    const element = viewportRef.current
    if (!element) return
    // Scrollbars must not change the reference size when zooming.
    const measure = () => setViewport({ w: element.offsetWidth, h: element.offsetHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  const availableWidth = Math.max(1, viewport.w - 64)
  const availableHeight = Math.max(1, viewport.h - 64)
  const fitScale = Math.min(availableWidth / image.w, availableHeight / image.h)
  const widthScale = availableWidth / image.w
  const scale = zoom === "page" ? fitScale : zoom === "width" ? widthScale : fitScale * zoom / 100
  const width = image.w * scale
  const height = image.h * scale
  const percent = Math.round(scale / fitScale * 100)
  const controlClass = "inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded border border-white/15 bg-white/5 px-2 text-xs text-gray-200 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:cursor-not-allowed disabled:opacity-40"
  const instruction = panMode ? "Arrastra el lienzo para recorrer la página. Los elementos no se moverán." : previewId ? "Puedes reproducir el vídeo. Vuelve a editar para moverlo o cambiar su tamaño." : "Selecciona y arrastra un elemento. Usa sus bordes para cambiar el tamaño."
  // Keep off-page artwork reachable, including the rotated corners of videos.
  const extent = overlays.reduce((bounds, overlay) => {
    const radians = overlay.type === "video" ? (overlay.rotate ?? 0) * Math.PI / 180 : 0
    const w = overlay.w / 100 * width
    const h = overlay.h / 100 * height
    const rotatedW = Math.abs(w * Math.cos(radians)) + Math.abs(h * Math.sin(radians))
    const rotatedH = Math.abs(w * Math.sin(radians)) + Math.abs(h * Math.cos(radians))
    const left = overlay.x / 100 * width + (w - rotatedW) / 2
    const top = overlay.y / 100 * height + (h - rotatedH) / 2
    return {
      left: Math.min(bounds.left, left), top: Math.min(bounds.top, top),
      right: Math.max(bounds.right, left + rotatedW), bottom: Math.max(bounds.bottom, top + rotatedH),
    }
  }, { left: 0, top: 0, right: width, bottom: height })
  const padding = { left: 32 - extent.left, top: 32 - extent.top, right: 32 + extent.right - width, bottom: 32 + extent.bottom - height }

  useLayoutEffect(() => {
    const viewportElement = viewportRef.current
    const pageElement = pageRef.current
    if (!viewportElement || !pageElement || typeof zoom === "number") return
    const pageRect = pageElement.getBoundingClientRect()
    const viewportRect = viewportElement.getBoundingClientRect()
    viewportElement.scrollLeft += pageRect.left - viewportRect.left - Math.max(32, (viewportElement.clientWidth - width) / 2)
    viewportElement.scrollTop += pageRect.top - viewportRect.top - Math.max(32, (viewportElement.clientHeight - height) / 2)
  }, [zoom, pageNum, width, height])

  const fit = (mode: "page" | "width") => {
    setZoom(mode)
    viewportRef.current?.scrollTo(0, 0)
  }

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Lienzo del editor">
      {toolbarHost && createPortal(<div className="flex items-center gap-2 whitespace-nowrap text-gray-200" role="group" aria-label="Controles del lienzo">
        <button type="button" className={controlClass} title="Alejar página" aria-label="Alejar página" disabled={percent <= 25} onClick={() => setZoom(Math.max(25, percent - 25))}>-</button>
        <output className="min-w-12 text-center text-xs font-mono" aria-label="Zoom respecto a la página ajustada">{percent}%</output>
        <button type="button" className={controlClass} title="Acercar página" aria-label="Acercar página" disabled={percent >= 400} onClick={() => setZoom(Math.min(400, percent + 25))}>+</button>
        <select className={`${controlClass} bg-[#151515]`} aria-label="Ajuste de vista" title="Ajuste de vista: 100% equivale a la página ajustada" value={typeof zoom === "number" ? "manual" : zoom} onChange={(event) => {
          if (event.target.value === "page" || event.target.value === "width") fit(event.target.value)
        }}>
          <option value="page">Ajustar página</option>
          <option value="width">Ajustar ancho</option>
          {typeof zoom === "number" && <option value="manual">Manual ({percent}%)</option>}
        </select>
        <button type="button" className={controlClass} title={panMode ? "Volver a seleccionar" : "Desplazar lienzo"} aria-label={panMode ? "Volver a seleccionar" : "Desplazar lienzo"} aria-pressed={panMode} onClick={() => setPanMode(!panMode)}>
          <FontAwesomeIcon icon={panMode ? faArrowPointer : faHand} className="size-3.5" aria-hidden="true" />
        </button>
        {validVideo && (
          <button type="button" className={`${controlClass} border-red-500/40 text-red-200`} title={previewId ? "Volver a editar vídeo" : "Probar vídeo"} aria-pressed={previewId === selectedId} onClick={() => setPreview(previewId ? null : { page: pageNum, id: selectedId! })}>
            <FontAwesomeIcon icon={previewId ? faPen : faPlay} className="size-3" aria-hidden="true" />
            {previewId ? "Volver a editar vídeo" : "Probar vídeo"}
          </button>
        )}
      </div>, toolbarHost)}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-[#252a31]"
        style={{ touchAction: panMode ? "none" : "auto", cursor: panMode ? "grab" : undefined }}
        tabIndex={0}
        aria-label="Página editable. Usa las barras de desplazamiento al ampliar."
        onPointerDown={(event) => {
          if (!panMode || event.button !== 0) return
          const element = event.currentTarget
          panStart.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }
          element.setPointerCapture(event.pointerId)
          event.preventDefault()
        }}
        onPointerMove={(event) => {
          const start = panStart.current
          if (!start) return
          event.currentTarget.scrollLeft = start.left - (event.clientX - start.x)
          event.currentTarget.scrollTop = start.top - (event.clientY - start.y)
        }}
        onPointerUp={() => { panStart.current = null }}
        onPointerCancel={() => { panStart.current = null }}
        onLostPointerCapture={() => { panStart.current = null }}
      >
        <div
          className="flex min-h-full min-w-full items-center justify-center"
          style={{ width: width + padding.left + padding.right, height: height + padding.top + padding.bottom, paddingLeft: padding.left, paddingRight: padding.right, paddingTop: padding.top, paddingBottom: padding.bottom }}
          onClick={(event) => { if (event.target === event.currentTarget) onSelect(null) }}
        >
          <div ref={pageRef} className="relative shrink-0 bg-black shadow-2xl" style={{ width, height }}>
            <img
              key={src}
              src={src}
              alt={`Página ${pageNum}`}
              className="block h-full w-full select-none"
              draggable={false}
              onClick={() => onSelect(null)}
              onLoad={(event) => setImage({ src, w: event.currentTarget.naturalWidth, h: event.currentTarget.naturalHeight })}
              onError={() => setFailedImage(src)}
            />
            {!ready && <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4 text-center text-sm" role="status">{failedImage === src ? "No se pudo cargar esta página. Comprueba la imagen del libro." : "Cargando página..."}</div>}
            {ready && overlays.map((overlay) => {
              const isSelected = overlay.id === selectedId
              const isPreview = overlay.id === previewId && Boolean(parseYouTubeId(overlay.videoId ?? ""))
              const rotated = overlay.type === "video" && Boolean(overlay.rotate)
              return (
                <Rnd
                  key={`${pageNum}-${overlay.id}`}
                  size={{ width: overlay.w / 100 * width, height: overlay.h / 100 * height }}
                  position={{ x: overlay.x / 100 * width, y: overlay.y / 100 * height }}
                  minWidth={Math.min(width / 1000, overlay.w / 100 * width)}
                  minHeight={Math.min(height / 1000, overlay.h / 100 * height)}
                  disableDragging={panMode || isPreview}
                  enableResizing={isSelected && !panMode && !isPreview}
                  lockAspectRatio={isSelected && lockAspectRatio && overlay.h > 0 ? overlay.w * width / (overlay.h * height) : false}
                  onDragStart={() => onSelect(overlay.id)}
                  onDragStop={(_event, data) => onChange(overlay.id, { x: data.x / width * 100, y: data.y / height * 100 })}
                  onResizeStop={(_event, _direction, element, _delta, position) => {
                    const rect = element.getBoundingClientRect()
                    onChange(overlay.id, {
                      w: rect.width / width * 100, h: rect.height / height * 100,
                      x: position.x / width * 100, y: position.y / height * 100,
                    })
                  }}
                  onMouseDown={() => { if (!panMode) onSelect(overlay.id) }}
                  onTouchStart={() => { if (!panMode) onSelect(overlay.id) }}
                  style={{ outline: isSelected && !isPreview ? "1px dashed #93c5fd" : undefined, zIndex: isSelected ? 10 : 5 }}
                  resizeHandleStyles={isSelected ? Object.fromEntries(["topLeft", "topRight", "bottomLeft", "bottomRight"].map((corner) => [corner, { width: 10, height: 10, background: "#fff", border: "2px solid #2563eb", borderRadius: 2 }])) : undefined}
                >
                  {/* Rnd owns translation; rotation belongs on a separate child. */}
                  <div className="relative h-full w-full" style={{
                    transform: rotated ? `rotate(${overlay.rotate}deg)` : undefined,
                    outline: isPreview ? undefined : isSelected ? "2px solid #3b82f6" : "1px dashed rgba(255,255,255,.5)",
                    borderRadius: overlay.type === "reveal" ? "50%" : overlay.type === "video" ? 8 : undefined,
                    background: overlay.type === "reveal" ? "rgba(168,85,247,.2)" : overlay.type === "button" ? "rgba(59,130,246,.15)" : undefined,
                    opacity: overlay.visible || isPreview ? 1 : 0.4,
                    pointerEvents: panMode ? "none" : undefined,
                  }}>
                    {overlay.type === "video" ? (
                      isPreview ? <iframe className="block h-full w-full rounded-lg border-0" src={`https://www.youtube-nocookie.com/embed/${overlay.videoId}?rel=0&playsinline=1`} title={`Vista previa de YouTube ${overlay.videoId}`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : (
                        <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-lg bg-black pointer-events-none">
                          {parseYouTubeId(overlay.videoId ?? "") && <img src={`https://i.ytimg.com/vi/${overlay.videoId}/hqdefault.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />}
                          <span className="relative rounded bg-black/75 px-2 py-1 text-center text-[11px] text-white">{overlay.videoId ? "YouTube" : "Añade un enlace de YouTube"}</span>
                        </div>
                      )
                    ) : overlay.type === "reveal" ? (
                      <div className="pointer-events-none flex h-full w-full items-center justify-center text-xs text-purple-200">{(overlay.name || "?").trim().split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase()}</div>
                    ) : overlay.src ? (
                      <img src={overlay.src} alt="" draggable={false} className="pointer-events-none h-full w-full" style={{ objectFit: overlay.fit ?? "contain" }} />
                    ) : (
                      <div className="pointer-events-none flex h-full w-full items-center justify-center text-xl">{overlay.icon ?? "Botón"}</div>
                    )}
                  </div>
                </Rnd>
              )
            })}
          </div>
        </div>
      </div>
      <footer className="flex h-10 shrink-0 items-center gap-3 border-t border-white/10 bg-[#151515] px-3 text-[11px] text-gray-400">
        <p className="min-w-0 flex-1 truncate" title={`${instruction} 100% equivale a la página ajustada; el zoom no modifica el libro.`}>
          {instruction} <span className="text-gray-500">100% = página ajustada.</span>
        </p>
        <nav className="flex shrink-0 items-center gap-2" aria-label="Navegación de páginas">
          <button type="button" className={controlClass} title="Página anterior" aria-label="Página anterior" disabled={pageNum <= 1} onClick={() => onPageChange(pageNum - 1)}>
            <FontAwesomeIcon icon={faChevronLeft} className="size-3" aria-hidden="true" />
          </button>
          <span className="min-w-20 text-center tabular-nums text-gray-300" aria-live="polite">Página {pageNum} / {manifest.pages}</span>
          <button type="button" className={controlClass} title="Página siguiente" aria-label="Página siguiente" disabled={pageNum >= manifest.pages} onClick={() => onPageChange(pageNum + 1)}>
            <FontAwesomeIcon icon={faChevronRight} className="size-3" aria-hidden="true" />
          </button>
        </nav>
      </footer>
    </section>
  )
}
