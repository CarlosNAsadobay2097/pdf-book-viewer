"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { createBrowserImagePreview } from "@/lib/browser-image-preview"

type BrowserAssetStore = {
  addFile: (file: File) => Promise<string>
  getFile: (url: string) => File | undefined
  retainFiles: (urls: Iterable<string>) => void
  commitFile: (url: string) => void
  releaseFile: (url: string) => void
}

const BrowserAssetsContext = createContext<BrowserAssetStore | null>(null)
const IMAGE_TYPES = new Set(["image/gif", "image/png", "image/jpeg", "image/webp"])
const AUDIO_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/webm"])

export function useBrowserAssets(): BrowserAssetStore | null {
  return useContext(BrowserAssetsContext)
}

export default function BrowserAssets({ children }: { children: ReactNode }) {
  // One stable owner, including across StrictMode's effect cleanup/setup cycle.
  const [owner] = useState(() => {
    const files = new Map<string, File>()
    const pending = new Set<string>()
    let bytes = 0
    let active = true
    let generation = 0
    const store: BrowserAssetStore = {
      async addFile(file) {
        if (!active) throw new Error("Esta sesion del editor ya no esta disponible")
        const session = generation
        if (!(file instanceof File) || !file.name.trim() || file.size === 0) {
          throw new Error("Selecciona un archivo valido que no este vacio")
        }
        const pdf = file.type === "application/pdf"
        if (!pdf && !IMAGE_TYPES.has(file.type) && !AUDIO_TYPES.has(file.type)) {
          throw new Error(`Tipo de archivo no soportado: ${file.type || "desconocido"}`)
        }
        const limit = (pdf ? 40 : 10) * 1024 * 1024
        if (file.size > limit) throw new Error(`El archivo supera el limite de ${pdf ? 40 : 10} MiB`)
        const checkCapacity = () => {
          if (!active || session !== generation) throw new Error("Esta sesion del editor ya no esta disponible")
          if (files.size >= 50) throw new Error("Solo se permiten 50 archivos por sesion")
          if (bytes + file.size > 100 * 1024 * 1024) throw new Error("Los archivos superan el limite total de 100 MiB")
        }
        checkCapacity()
        if (IMAGE_TYPES.has(file.type)) {
          await createBrowserImagePreview(file)
          checkCapacity()
        }
        const url = URL.createObjectURL(file)
        files.set(url, file)
        pending.add(url)
        bytes += file.size
        return url
      },
      getFile: (url) => files.get(url),
      retainFiles(urls) {
        const retained = new Set(urls)
        for (const url of files.keys()) {
          // An older manifest effect must not collect a file awaiting its callback.
          if (!retained.has(url) && !pending.has(url)) store.releaseFile(url)
        }
      },
      commitFile(url) { pending.delete(url) },
      releaseFile(url) {
        const file = files.get(url)
        if (!file) return
        URL.revokeObjectURL(url)
        files.delete(url)
        pending.delete(url)
        bytes -= file.size
      },
    }
    return {
      store,
      activate() { active = true },
      dispose() {
        active = false
        generation++
        for (const url of files.keys()) URL.revokeObjectURL(url)
        files.clear()
        pending.clear()
        bytes = 0
      },
    }
  })

  useEffect(() => {
    owner.activate()
    return () => owner.dispose()
  }, [owner])

  return <BrowserAssetsContext.Provider value={owner.store}>{children}</BrowserAssetsContext.Provider>
}
