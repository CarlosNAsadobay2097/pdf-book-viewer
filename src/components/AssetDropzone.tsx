"use client"

import { useEffect, useRef, useState } from "react"
import { useBrowserAssets } from "./BrowserAssets"

interface AssetDropzoneProps {
  label: string
  value?: string
  /** ej: "image/webp,image/gif,image/png,image/jpeg" o "audio/*" */
  accept: string
  onChange: (url: string) => void
}

export default function AssetDropzone({ label, value, accept, onChange }: AssetDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const browserAssets = useBrowserAssets()
  const lifecycle = useRef({ active: true, request: 0 })

  useEffect(() => {
    const state = lifecycle.current
    state.active = true
    return () => { state.active = false; state.request++ }
  }, [])

  const upload = async (file: File) => {
    const state = lifecycle.current
    const request = ++state.request
    const current = () => state.active && request === state.request
    setUploading(true)
    setError(null)
    let pendingUrl: string | undefined
    try {
      const accepted = accept.split(",").some((type) => {
        const mime = type.trim()
        return mime.endsWith("/*") ? file.type.startsWith(mime.slice(0, -1)) : file.type === mime
      })
      if (!accepted) throw new Error("El tipo de archivo no corresponde a este campo")
      let url: string
      if (browserAssets) {
        url = await browserAssets.addFile(file)
        pendingUrl = url
      } else {
        const formData = new FormData()
        formData.append("file", file)
        const res = await fetch("/api/upload", { method: "POST", body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Error al subir")
        url = data.url as string
      }
      // Keep the callback from the original selection, not a later selected item.
      if (current()) {
        onChange(url)
        if (browserAssets) browserAssets.commitFile(url)
        pendingUrl = undefined
      }
    } catch (e) {
      if (current()) setError(e instanceof Error ? e.message : browserAssets ? "Error al preparar el archivo" : "Error al subir")
    } finally {
      if (pendingUrl) browserAssets?.releaseFile(pendingUrl)
      if (current()) setUploading(false)
    }
  }

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) upload(file)
  }

  const isImage = accept.startsWith("image")
  const isAudio = accept.startsWith("audio")
  const isDocument = !isImage && !isAudio
  const fileName = value ? browserAssets?.getFile(value)?.name : undefined

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-400">{label}</span>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
        className={`cursor-pointer rounded border border-dashed px-3 py-4 text-center text-xs transition-colors ${
          isDragging ? "border-blue-400 bg-blue-500/10" : "border-white/20 hover:border-white/40"
        }`}
      >
        {uploading ? (
          <span className="text-blue-400">{browserAssets ? "Preparando archivo..." : "Subiendo…"}</span>
        ) : value ? (
          <div className="flex flex-col items-center gap-2">
            {isImage && (
              <img src={value} alt="" className="max-h-16 max-w-full object-contain rounded" />
            )}
            {isAudio && (
              <audio
                controls
                src={value}
                className="w-full h-8"
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {isDocument && (
              <div className="flex items-center gap-2 text-gray-300">
                <span className="text-xl">📄</span>
                <span className="text-xs">{fileName ?? value.split("/").pop()}</span>
              </div>
            )}
            <span className="text-[10px] text-gray-500 break-all">{fileName ?? value}</span>
            <button type="button" aria-label={`Reemplazar archivo: ${label}`} onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }} className="text-blue-400 underline focus-visible:outline-2 focus-visible:outline-blue-400">Reemplazar archivo</button>
          </div>
        ) : (
          <button type="button" aria-label={`Seleccionar archivo: ${label}`} onClick={(event) => { event.stopPropagation(); inputRef.current?.click() }} className="text-gray-400 focus-visible:outline-2 focus-visible:outline-blue-400">Arrastra un archivo aquí o haz clic para elegirlo</button>
        )}
      </div>

      {browserAssets && <span className="text-[10px] text-gray-500">Solo en esta pestaña. No se sube al servidor.</span>}
      {error && <span className="text-[10px] text-red-400">{error}</span>}

      <input
        ref={inputRef}
        type="file"
        aria-label={label}
        accept={accept}
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = "" }}
      />
    </div>
  )
}
