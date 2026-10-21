"use client"

import "@/app/editor/editor.css"
import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faArrowRotateLeft, faBolt, faBookOpen, faChevronLeft, faChevronRight, faCircleDot, faEye, faEyeSlash, faFileLines, faImage, faLayerGroup, faMousePointer, faPlus, faSave, faVideo, faXmark } from "@fortawesome/free-solid-svg-icons"
import type { Manifest, OverlayType, PageOverlay } from "@/types/overlay"
import AssetDropzone from "@/components/AssetDropzone"
import EditorCanvas from "@/components/EditorCanvas"
import EditorProperties from "@/components/EditorProperties"
import EditorImagePreview from "@/components/EditorImagePreview"
import { parseYouTubeId } from "@/lib/youtube"
import { bookBasePath } from "@/lib/book-config"
import BrowserAssets, { useBrowserAssets } from "@/components/BrowserAssets"
import EditorPreview from "@/components/EditorPreview"

const tools = [
  { id: "pages", label: "Páginas", icon: faFileLines, description: "Navega por las hojas del libro." },
  { id: "image", label: "Imagen", icon: faImage, description: "Añade imágenes, ilustraciones o GIF a la página." },
  { id: "button", label: "Botones", icon: faMousePointer, description: "Configura audio, enlaces y acciones desde las propiedades del botón." },
  { id: "video", label: "Vídeo", icon: faVideo, description: "Inserta un vídeo de YouTube sobre la página." },
  { id: "reveal", label: "Revelados", icon: faCircleDot, description: "Prepara zonas que revelan una foto y una ficha de información." },
  { id: "elements", label: "Elementos", icon: faLayerGroup, description: "Selecciona y revisa los elementos de esta página." },
  { id: "book", label: "Libro", icon: faBookOpen, description: "Índice y recursos compartidos por todo el libro." },
] as const

type Tool = typeof tools[number]["id"]
const elementLabels: Record<OverlayType, string> = { image: "Imagen", button: "Botón", video: "Vídeo", reveal: "Revelado" }
const elementIcons = { image: faImage, button: faMousePointer, video: faVideo, reveal: faCircleDot }

function newOverlay(type: OverlayType, existingCount: number): PageOverlay {
  // Stagger new elements so that consecutive insertions remain discoverable.
  const step = (existingCount % 6) * 7
  const common = { id: crypto.randomUUID(), type, x: 15 + step, y: 15 + step, action: "none" as const }
  if (type === "reveal") return {
    ...common, w: 10, h: 10, visible: true, clickable: true,
    name: "Nombre Apellido", role: "Cargo", bio: "", avatarColor: "#4a6cf7",
  }
  if (type === "video") return { ...common, w: 30, h: 20, visible: true, clickable: false, rotate: 0 }
  return {
    ...common, w: type === "image" ? 20 : 8, h: type === "image" ? 20 : 8,
    visible: type === "button", clickable: true, icon: type === "button" ? "🔊" : undefined,
  }
}

export default function BookEditor({ sandbox = false }: { sandbox?: boolean }) {
  const [session, setSession] = useState(0)
  return sandbox ? (
    <BrowserAssets key={session}><EditorWorkspace sandbox onReset={() => setSession((value) => value + 1)} /></BrowserAssets>
  ) : <EditorWorkspace sandbox={false} />
}

function EditorWorkspace({ sandbox, onReset }: { sandbox: boolean; onReset?: () => void }) {
  const browserAssets = useBrowserAssets()
  const workspaceRef = useRef<HTMLDivElement>(null)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [pageNum, setPageNum] = useState(1)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTool, setActiveTool] = useState<Tool>("pages")
  const [panelOpen, setPanelOpen] = useState(true)
  const [toolbarHost, setToolbarHost] = useState<HTMLDivElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState("")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [aspectLockedId, setAspectLockedId] = useState<string | null>(null)
  const selectedThumbnail = useRef<HTMLButtonElement | null>(null)
  const activeToolButton = useRef<HTMLButtonElement | null>(null)
  const allowExit = useRef(false)
  const [previewManifest, setPreviewManifest] = useState<Manifest | null>(null)
  const dirty = manifest !== null && JSON.stringify(manifest) !== savedSnapshot

  useEffect(() => {
    const controller = new AbortController()
    fetch(sandbox ? `${bookBasePath}/manifest.json` : "/api/manifest", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<Manifest>
      })
      .then((data) => {
        if (controller.signal.aborted) return
        setManifest(structuredClone(data))
        setSavedSnapshot(JSON.stringify(data))
      })
      .catch((error) => { if (!controller.signal.aborted) setLoadError(error.message) })
    return () => controller.abort()
  }, [sandbox])

  useEffect(() => {
    if (!sandbox || !dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      if (allowExit.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [sandbox, dirty])

  useEffect(() => {
    if (!browserAssets) return
    const urls: string[] = []
    for (const document of [manifest, previewManifest]) {
      if (!document) continue
      for (const elements of Object.values(document.overlays ?? {})) {
        for (const element of elements) {
          if (element.src) urls.push(element.src)
          if (element.audioSrc) urls.push(element.audioSrc)
        }
      }
      urls.push(...Object.values(document.revealImages ?? {}))
      if (document.revealCardBg) urls.push(document.revealCardBg)
      if (document.downloadPdfUrl) urls.push(document.downloadPdfUrl)
    }
    browserAssets.retainFiles(urls)
  }, [manifest, previewManifest, browserAssets])

  useEffect(() => {
    if (activeTool === "pages" && panelOpen) selectedThumbnail.current?.scrollIntoView({ block: "nearest" })
  }, [pageNum, activeTool, panelOpen])

  const overlays = manifest?.overlays?.[String(pageNum)] ?? []
  const updateOverlays = useCallback((updater: (list: PageOverlay[]) => PageOverlay[]) => {
    setManifest((previous) => {
      if (!previous) return previous
      const key = String(pageNum)
      return { ...previous, overlays: { ...previous.overlays, [key]: updater(previous.overlays?.[key] ?? []) } }
    })
  }, [pageNum])

  const patchOverlay = (id: string, patch: Partial<PageOverlay>) => {
    updateOverlays((list) => list.map((overlay) => overlay.id === id ? { ...overlay, ...patch } : overlay))
  }
  const addOverlay = (type: OverlayType) => {
    const overlay = newOverlay(type, overlays.length)
    updateOverlays((list) => [...list, overlay])
    setSelectedId(overlay.id)
  }
  const changePage = (page: number) => {
    if (!manifest) return
    setPageNum(Math.max(1, Math.min(manifest.pages, page)))
    setSelectedId(null)
  }

  const save = async () => {
    if (sandbox || !manifest || saving) return
    const snapshot = JSON.stringify(manifest)
    setSaving(true)
    setSaveError(null)
    try {
      const response = await fetch("/api/manifest", { method: "PUT", headers: { "Content-Type": "application/json" }, body: snapshot })
      if (!response.ok) throw new Error("save failed")
      setSavedSnapshot(snapshot)
      setSavedAt(new Date().toLocaleTimeString())
    } catch {
      setSaveError("No se pudo guardar. Comprueba la conexión y el servidor e inténtalo otra vez.")
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <div className="h-screen bg-[#11151b] p-8 text-red-300" role="alert">No se pudo cargar el libro: {loadError}</div>
  if (!manifest) return <div className="flex h-screen items-center justify-center bg-[#11151b] text-sm text-gray-400" role="status">Cargando editor...</div>

  const selected = overlays.find((overlay) => overlay.id === selectedId) ?? null
  const currentTool = tools.find((tool) => tool.id === activeTool)!
  const pageSrc = (page: number) => `${manifest.basePath}/page-${String(page).padStart(3, "0")}.${manifest.format}`
  const smallButton = "inline-flex h-8 items-center justify-center gap-2 rounded border border-white/10 bg-white/5 px-2 text-xs text-gray-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-400 disabled:opacity-30"
  const inputClass = "min-w-0 rounded border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-white focus:border-blue-400 focus:outline-none"

  const elementList = (type?: OverlayType) => {
    const items = overlays.filter((overlay) => !type || overlay.type === type)
    return <div className="space-y-2">
      {items.length === 0 && <p className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs leading-5 text-gray-500">{type ? "Todavía no hay elementos de este tipo en la página." : "Esta página no tiene elementos añadidos. Elige una categoría para insertar uno."}</p>}
      {items.map((overlay) => {
        const index = overlays.indexOf(overlay) + 1
        return <div key={overlay.id} className={`flex items-center gap-1 rounded-md border p-1 ${selectedId === overlay.id ? "border-blue-500/60 bg-blue-500/10" : "border-white/10 bg-white/[.025]"}`}>
          <button type="button" onClick={() => setSelectedId(overlay.id)} aria-pressed={selectedId === overlay.id} className="flex min-w-0 flex-1 items-center gap-2 rounded px-1.5 py-2 text-left hover:bg-white/5">
            {overlay.type === "image" || (overlay.type === "button" && overlay.src) ? (
              <EditorImagePreview key={overlay.src ?? "empty"} src={overlay.src} label={`${elementLabels[overlay.type]} ${index}`} detail={`${overlay.visible ? "Visible al abrir" : "Oculto al abrir"} · ${overlay.id.slice(0, 8)}`} />
            ) : <><FontAwesomeIcon icon={elementIcons[overlay.type]} className="size-4 shrink-0 text-gray-400" />
            <span className="min-w-0">
              <span className="block truncate text-xs text-gray-200">{overlay.type === "reveal" && overlay.name ? overlay.name : `${elementLabels[overlay.type]} ${index}`}</span>
              <span className="mt-1 block truncate text-[10px] text-gray-500">{overlay.visible ? "Visible al abrir" : "Oculto al abrir"} · {overlay.id.slice(0, 8)}</span>
            </span></>}
          </button>
          <button type="button" onClick={() => patchOverlay(overlay.id, { visible: !overlay.visible })} aria-label={`${overlay.visible ? "Ocultar" : "Mostrar"} ${elementLabels[overlay.type]} ${index} al abrir la página`} title={overlay.visible ? "Ocultar al abrir la página" : "Mostrar al abrir la página"} className="flex size-7 shrink-0 items-center justify-center rounded text-xs text-gray-400 hover:bg-white/10 hover:text-white">
            <FontAwesomeIcon icon={overlay.visible ? faEye : faEyeSlash} />
          </button>
        </div>
      })}
    </div>
  }

  return (
    <div ref={workspaceRef} className="editor-shell flex h-dvh min-h-0 min-w-[1120px] flex-col overflow-hidden bg-[#11151b] text-white">
      <header className="z-20 flex h-16 shrink-0 items-center gap-4 border-b border-white/10 bg-[#15191f] px-5" aria-label="Barra del editor">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold text-gray-100" title={manifest.name}>{manifest.name.replaceAll("_", " ")}</h1>
          <p className="mt-1 text-[10px] uppercase tracking-[.16em] text-gray-500">{sandbox ? "Copia temporal · Modo de prueba" : "Editor de libro interactivo"}</p>
        </div>
        <div ref={setToolbarHost} className="flex shrink-0 items-center border-r border-white/10 pr-4" />
        {sandbox ? <>
          <button type="button" className={smallButton} onClick={() => {
            if (!dirty || window.confirm("Se descartarán los cambios y archivos de esta prueba. ¿Quieres empezar de nuevo?")) onReset?.()
          }} title="Descartar la copia y volver a cargar la demo"><FontAwesomeIcon icon={faArrowRotateLeft} /> Reiniciar</button>
          <button type="button" className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-3 text-xs font-semibold hover:bg-blue-500" onClick={() => {
            workspaceRef.current?.querySelectorAll<HTMLMediaElement>("audio, video").forEach((media) => media.pause())
            setPreviewManifest(structuredClone(manifest))
          }}><FontAwesomeIcon icon={faBookOpen} /> Previsualizar</button>
          <Link href="/" className={smallButton} onClick={(event) => {
            if (dirty && !window.confirm("Los cambios de esta prueba se perderán al salir. ¿Volver a la demo publicada?")) event.preventDefault()
            else allowExit.current = true
          }}>Salir</Link>
        </> : <><a href="/" target="_blank" rel="noopener noreferrer" className={smallButton} title="Abre el visor con la última versión guardada del libro">
          <FontAwesomeIcon icon={faBookOpen} className="size-3.5" /> Ver libro guardado
        </a>
        <div className="flex shrink-0 items-center gap-3">
          <span className={`max-w-36 text-right text-[11px] ${dirty ? "text-amber-300" : "text-gray-400"}`} role="status">{saving ? "Guardando..." : dirty ? "Cambios sin guardar" : savedAt ? `Guardado ${savedAt}` : "Sin cambios pendientes"}</span>
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
            <FontAwesomeIcon icon={faSave} className="size-3.5" /> {saving ? "Guardando..." : "Guardar"}
          </button>
        </div></>}
      </header>
      {sandbox && <div className="flex shrink-0 items-center justify-between gap-4 border-b border-blue-400/15 bg-[#142136] px-5 py-2 text-[11px] text-blue-100" role="status"><span>Prueba privada en esta pestaña. Los cambios se conservan al previsualizar, pero se pierden al recargar o salir. No se modifica la demo.</span><span className="shrink-0 text-blue-300">{dirty ? "Copia modificada" : "Demo sin modificar"} · Sin publicación</span></div>}
      {saveError && <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-500/20 bg-red-950 px-5 py-2 text-xs text-red-200" role="alert">{saveError}<button type="button" aria-label="Cerrar aviso de guardado" onClick={() => setSaveError(null)} className="p-1"><FontAwesomeIcon icon={faXmark} /></button></div>}

      <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        <nav className="flex min-h-0 w-[88px] shrink-0 flex-col gap-1 overflow-x-hidden overflow-y-auto overscroll-y-contain border-r border-white/10 bg-[#191e26] px-2 py-3" aria-label="Herramientas del editor">
          {tools.map((tool) => <button key={tool.id} ref={activeTool === tool.id ? activeToolButton : undefined} type="button" aria-pressed={activeTool === tool.id && panelOpen} aria-expanded={activeTool === tool.id && panelOpen} aria-controls={panelOpen ? "editor-tool-panel" : undefined} title={tool.label} onClick={() => {
            if (activeTool === tool.id) setPanelOpen(!panelOpen)
            else { setActiveTool(tool.id); setPanelOpen(true) }
          }} className={`relative flex min-h-[70px] shrink-0 flex-col items-center justify-center gap-2 rounded-md text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-blue-400 ${activeTool === tool.id && panelOpen ? "bg-blue-500/15 text-blue-300" : "text-gray-400 hover:bg-white/5 hover:text-gray-100"}`}>
            <FontAwesomeIcon icon={tool.icon} style={{ width: 18, height: 18 }} />
            {tool.label}
          </button>)}
        </nav>

        {panelOpen && <aside id="editor-tool-panel" className="flex min-h-0 min-w-0 w-[256px] shrink-0 flex-col overflow-hidden border-r border-white/10 bg-[#15191f]" aria-label={`Panel ${currentTool.label}`}>
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 p-4">
            <div className="min-w-0"><h2 className="text-sm font-semibold">{currentTool.label}</h2><p className="mt-1.5 text-xs leading-5 text-gray-500">{currentTool.description}</p></div>
            <button type="button" className="mt-0.5 shrink-0 text-xs text-gray-500 hover:text-white" aria-label="Contraer panel de herramientas" title="Contraer panel" onClick={() => { setPanelOpen(false); activeToolButton.current?.focus() }}><FontAwesomeIcon icon={faChevronLeft} /></button>
          </div>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 [scrollbar-gutter:stable]" role="region" aria-label={`Contenido de ${currentTool.label}`} tabIndex={0}>
            {activeTool === "pages" && <div className="space-y-3">
              {Array.from({ length: manifest.pages }, (_, index) => index + 1).map((page) => {
                const elements = manifest.overlays?.[String(page)] ?? []
                const interactiveCount = elements.filter((element) => {
                  if (element.type === "video") return Boolean(parseYouTubeId(element.videoId ?? ""))
                  if (element.type === "reveal") return Boolean(manifest.revealImages?.[String(page)])
                  if (!element.clickable) return false
                  if (element.audioSrc?.trim()) return true
                  if (element.action === "link") return Boolean(element.linkUrl?.trim())
                  if (element.action === "toggleTarget" || element.action === "timedSwap") {
                    return element.targetIds?.some((id) => elements.some((target) => target.id === id && target.type !== "reveal"))
                  }
                  return false
                }).length
                const summary = ([['image', 'imagen', 'imágenes'], ['button', 'botón', 'botones'], ['video', 'vídeo', 'vídeos'], ['reveal', 'revelado', 'revelados']] as const)
                  .map(([type, singular, plural]) => {
                    const count = elements.filter((element) => element.type === type).length
                    return count ? `${count} ${count === 1 ? singular : plural}` : null
                  }).filter(Boolean).join(", ") || "Sin elementos añadidos"
                return <button type="button" key={page} ref={page === pageNum ? selectedThumbnail : undefined} onClick={() => changePage(page)} aria-label={`Ir a página ${page}`} title={`${summary}. ${interactiveCount} con interacción, incluidos los ocultos al abrir.`} aria-current={page === pageNum ? "page" : undefined} className={`block w-full rounded-lg border p-3 text-left transition-colors ${page === pageNum ? "border-blue-500/70 bg-blue-500/10" : "border-white/5 bg-white/[.025] hover:border-white/20"}`}>
                  <span className="relative block">
                    <img src={pageSrc(page)} alt={`Miniatura de página ${page}`} loading="lazy" decoding="async" draggable={false} className="mx-auto block h-36 w-full max-w-full rounded-sm object-contain" />
                    {interactiveCount > 0 && <span className="absolute right-0 top-0 inline-flex items-center gap-1 rounded border border-blue-400/30 bg-[#163354] px-1.5 py-1 text-[10px] font-semibold text-blue-200 shadow-sm" aria-label={`${interactiveCount} ${interactiveCount === 1 ? "elemento interactivo" : "elementos interactivos"}`}><FontAwesomeIcon icon={faBolt} aria-hidden="true" />{interactiveCount}</span>}
                  </span>
                  <span className="mt-3 flex items-center justify-between text-[11px]"><span className={page === pageNum ? "text-blue-300" : "text-gray-400"}>Página {String(page).padStart(2, "0")}</span><span className="text-gray-500">{elements.length} {elements.length === 1 ? "elemento" : "elementos"}</span></span>
                </button>
              })}
            </div>}

            {(activeTool === "image" || activeTool === "button" || activeTool === "video" || activeTool === "reveal") && <div className="space-y-5">
              <button type="button" onClick={() => addOverlay(activeTool)} className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-3 py-3 text-xs font-semibold hover:bg-blue-500"><FontAwesomeIcon icon={faPlus} className="size-3" />{activeTool === "image" ? "Añadir imagen" : activeTool === "button" ? "Añadir botón" : activeTool === "video" ? "Añadir vídeo de YouTube" : "Añadir punto de revelado"}</button>
              <p className="text-xs leading-5 text-gray-400">{activeTool === "image" ? "Después de insertar, carga el archivo y ajusta su encuadre en Propiedades. Admite imágenes, WebP y GIF." : activeTool === "button" ? "Selecciona el botón y configura su imagen, sonido o enlace en Propiedades. También puede mostrar otros elementos." : activeTool === "video" ? "Pega el enlace en Propiedades. Desde la barra superior puedes probar el vídeo seleccionado." : "La foto real debe tener el mismo tamaño y composición que la página original."}</p>
              {activeTool === "reveal" && <div className="border-t border-white/10 pt-4"><AssetDropzone key={pageNum} label={`Foto real de la página ${pageNum}`} accept="image/webp,image/gif,image/png,image/jpeg" value={manifest.revealImages?.[String(pageNum)]} onChange={(url) => setManifest((previous) => previous ? { ...previous, revealImages: { ...previous.revealImages, [String(pageNum)]: url } } : previous)} /></div>}
              <div className="border-t border-white/10 pt-4"><h3 className="mb-3 text-[10px] uppercase tracking-wider text-gray-500">En esta página</h3>{elementList(activeTool)}</div>
            </div>}

            {activeTool === "elements" && <div><p className="mb-4 text-xs text-gray-400">Página {pageNum} · {overlays.length} elementos</p>{elementList()}</div>}

            {activeTool === "book" && <div className="space-y-5">
              <details open className="group"><summary className="cursor-pointer text-xs font-semibold text-gray-200">Índice del libro</summary><div className="mt-4 space-y-3">
                <p className="text-[11px] leading-5 text-gray-500">Define los títulos y las páginas que aparecen en el índice del visor.</p>
                {(manifest.tableOfContents ?? []).map((entry) => <div key={entry.id} className="space-y-2 rounded-md border border-white/10 p-2">
                  <input aria-label="Título de entrada del índice" className={`${inputClass} w-full`} value={entry.label} onChange={(event) => setManifest((previous) => previous ? { ...previous, tableOfContents: previous.tableOfContents?.map((item) => item.id === entry.id ? { ...item, label: event.target.value } : item) } : previous)} />
                  <div className="flex items-center gap-2"><label className="flex flex-1 items-center gap-2 text-[11px] text-gray-500">Página<input type="number" min={1} max={manifest.pages} className={`${inputClass} w-16`} value={entry.page} onChange={(event) => {
                    const page = event.target.valueAsNumber
                    if (!Number.isFinite(page)) return
                    setManifest((previous) => previous ? { ...previous, tableOfContents: previous.tableOfContents?.map((item) => item.id === entry.id ? { ...item, page: Math.max(1, Math.min(manifest.pages, Math.round(page))) } : item) } : previous)
                  }} /></label><button type="button" aria-label={`Eliminar entrada ${entry.label}`} onClick={() => setManifest((previous) => previous ? { ...previous, tableOfContents: previous.tableOfContents?.filter((item) => item.id !== entry.id) } : previous)} className="p-1 text-xs text-gray-500 hover:text-red-300"><FontAwesomeIcon icon={faXmark} /></button></div>
                </div>)}
                <button type="button" className={`${smallButton} w-full`} onClick={() => setManifest((previous) => previous ? { ...previous, tableOfContents: [...(previous.tableOfContents ?? []), { id: crypto.randomUUID(), label: "Nuevo cuento", page: pageNum }] } : previous)}><FontAwesomeIcon icon={faPlus} /> Agregar entrada</button>
              </div></details>
              <div className="border-t border-white/10 pt-5"><AssetDropzone label="PDF descargable para lectores" accept="application/pdf" value={manifest.downloadPdfUrl} onChange={(url) => setManifest((previous) => previous ? { ...previous, downloadPdfUrl: url } : previous)} /></div>
              <div className="border-t border-white/10 pt-5"><AssetDropzone label="Fondo de las fichas de revelado" accept="image/webp,image/png,image/jpeg" value={manifest.revealCardBg} onChange={(url) => setManifest((previous) => previous ? { ...previous, revealCardBg: url } : previous)} /></div>
              <p className="text-[11px] leading-5 text-gray-500">{sandbox ? "Estos ajustes solo afectan a tu copia temporal. Usa Previsualizar para probarlos; no se guardan en el servidor." : "Estos ajustes se aplican a todo el libro. Usa Guardar en la barra superior para conservar los cambios."}</p>
            </div>}
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2 border-t border-white/10 px-3 py-3">
            <button type="button" aria-label="Página anterior en panel" disabled={pageNum === 1} className={smallButton} onClick={() => changePage(pageNum - 1)}><FontAwesomeIcon icon={faChevronLeft} /></button>
            <label className="flex items-center gap-1 text-xs text-gray-500"><span className="sr-only">Ir a página</span><input type="number" aria-label="Ir a página" min={1} max={manifest.pages} value={pageNum} className={`${inputClass} w-14 text-center`} onChange={(event) => { if (Number.isFinite(event.target.valueAsNumber)) changePage(Math.round(event.target.valueAsNumber)) }} /> / {manifest.pages}</label>
            <button type="button" aria-label="Página siguiente en panel" disabled={pageNum === manifest.pages} className={smallButton} onClick={() => changePage(pageNum + 1)}><FontAwesomeIcon icon={faChevronRight} /></button>
          </div>
        </aside>}

        <EditorCanvas manifest={manifest} pageNum={pageNum} selectedId={selectedId} lockAspectRatio={aspectLockedId === selectedId} toolbarHost={toolbarHost} suspended={previewManifest !== null} onPageChange={changePage} onSelect={setSelectedId} onChange={patchOverlay} />

        <aside className="min-h-0 min-w-0 w-[304px] shrink-0 overflow-hidden border-l border-white/10 bg-[#15191f]" aria-label="Propiedades">
          <EditorProperties manifest={manifest} pageNum={pageNum} selected={selected} overlays={overlays} aspectLocked={aspectLockedId === selectedId} onAspectLock={(locked) => setAspectLockedId(locked ? selectedId : null)} onChange={(patch) => { if (selected) patchOverlay(selected.id, patch) }} onRemove={() => {
            if (selected) updateOverlays((list) => list.filter((overlay) => overlay.id !== selected.id))
            setSelectedId(null)
          }} onDeselect={() => setSelectedId(null)} />
        </aside>
      </main>
      {previewManifest && <EditorPreview manifest={previewManifest} onClose={() => setPreviewManifest(null)} />}
    </div>
  )
}
