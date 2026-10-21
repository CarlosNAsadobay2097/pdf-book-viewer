"use client"

import { useEffect, useRef } from "react"
import FlipBook from "@/components/FlipBook"
import type { Manifest } from "@/types/overlay"

export default function EditorPreview({ manifest, onClose }: { manifest: Manifest; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    const previousFocus = document.activeElement
    const wasFullscreen = Boolean(document.fullscreenElement)
    dialog?.showModal()
    return () => {
      dialog?.close()
      if (!wasFullscreen && document.fullscreenElement) void document.exitFullscreen().catch(() => {})
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus()
    }
  }, [])

  return (
    <dialog ref={dialogRef} aria-label="Previsualización temporal" onCancel={(event) => { event.preventDefault(); onClose() }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-[#11151b] p-0 text-white">
      <div className="flex h-full min-h-0 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-white/10 bg-[#15191f] px-5">
          <p className="text-xs text-gray-300">Previsualización de tu copia · No publicada</p>
          <button type="button" autoFocus onClick={onClose} className="rounded-md border border-blue-400/40 bg-blue-500/10 px-4 py-2 text-xs text-blue-200 hover:bg-blue-500/20">Volver al editor</button>
        </header>
        <div className="min-h-0 flex-1"><FlipBook manifest={manifest} embedded /></div>
      </div>
    </dialog>
  )
}
