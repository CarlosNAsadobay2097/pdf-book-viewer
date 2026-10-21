"use client"

import { useEffect, useRef, useState } from "react"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFilm, faImage } from "@fortawesome/free-solid-svg-icons"
import { useBrowserAssets } from "./BrowserAssets"
import { createBrowserImagePreview } from "@/lib/browser-image-preview"

interface Props {
  src?: string
  label: string
  detail: string
}

export default function EditorImagePreview({ src, label, detail }: Props) {
  const container = useRef<HTMLSpanElement>(null)
  const browserAssets = useBrowserAssets()
  const [result, setResult] = useState<{ src: string; store: typeof browserAssets; preview?: { url: string; format: string; animated: boolean | null }; error?: string } | null>(null)
  const preview = result && result.src === src && result.store === browserAssets ? result.preview : undefined
  const failure = result && result.src === src && result.store === browserAssets ? result.error : undefined

  useEffect(() => {
    const element = container.current
    if (!src || !element) return
    const controller = new AbortController()
    let active = true
    let objectUrl: string | undefined
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      const load = async () => {
        let blob: Blob
        let format: string
        let animated: boolean | null
        if (browserAssets) {
          const file = browserAssets.getFile(src)
          let original: Blob
          if (file) original = file
          else {
            const response = await fetch(src, { signal: controller.signal })
            if (!response.ok) throw new Error("Vista previa no disponible")
            original = await response.blob()
          }
          if (!active) return
          const generated = await createBrowserImagePreview(original)
          blob = generated.blob
          format = generated.format
          animated = generated.animated
        } else {
          const response = await fetch(`/api/image-preview?src=${encodeURIComponent(src)}`, { signal: controller.signal })
          if (!response.ok) throw new Error("Vista previa no disponible")
          blob = await response.blob()
          format = response.headers.get("X-Image-Format") ?? "Imagen"
          animated = response.headers.get("X-Image-Animated") === "true"
        }
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setResult({ src, store: browserAssets, preview: { url: objectUrl, format, animated } })
      }
      void load().catch((error) => {
        if (active) setResult({ src, store: browserAssets, error: error instanceof Error ? error.message : "Vista previa no disponible" })
      })
    })
    observer.observe(element)
    return () => {
      active = false
      observer.disconnect()
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src, browserAssets])

  return (
    <span ref={container} className="flex min-w-0 flex-1 items-center gap-2" title={src}>
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-[#10141a] text-gray-500">
        {preview ? (
          // Both paths produce a small static thumbnail, never the animated original.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.url} alt="" draggable={false} className="h-full w-full object-contain" />
        ) : <FontAwesomeIcon icon={faImage} style={{ width: 18, height: 18 }} aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs text-gray-200">{label}</span>
        <span className={`mt-1 flex items-center gap-1 text-[10px] ${preview?.animated ? "text-blue-300" : "text-gray-400"}`}>
          {preview ? <><FontAwesomeIcon icon={preview.animated ? faFilm : faImage} aria-hidden="true" /> {preview.format} · {preview.animated === null ? "Tipo no determinado" : preview.animated ? "Animación" : "Imagen"}</> : !src ? "Sin archivo" : failure ?? "Cargando miniatura..."}
        </span>
        <span className="mt-1 block truncate text-[10px] text-gray-500">{detail}</span>
      </span>
    </span>
  )
}
