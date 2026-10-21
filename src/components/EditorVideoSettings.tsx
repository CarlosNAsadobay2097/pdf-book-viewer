"use client"

import { useId, useState } from "react"
import { parseYouTubeId } from "@/lib/youtube"
import type { PageOverlay } from "@/types/overlay"

export default function EditorVideoSettings({ overlay, onChange }: {
  overlay: PageOverlay
  onChange: (patch: Partial<PageOverlay>) => void
}) {
  const [raw, setRaw] = useState(overlay.videoId ?? "")
  const id = useId()
  const invalid = raw.trim() !== "" && parseYouTubeId(raw) === null
  const rotate = Number.isFinite(overlay.rotate) ? overlay.rotate! : 0

  return (
    <div className="flex flex-col gap-3 text-sm">
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2 text-xs uppercase text-gray-500">Video de YouTube</legend>
        <label htmlFor={`${id}-video`} className="text-xs text-gray-400">
          URL o ID del video
        </label>
        <input
          id={`${id}-video`}
          type="text"
          className="bg-white/5 border border-white/10 rounded px-2 py-1"
          placeholder="https://youtu.be/XXXXXXXXXXX o ID"
          value={raw}
          aria-invalid={invalid}
          aria-describedby={`${id}-help${invalid ? ` ${id}-error` : ""}`}
          onChange={(event) => {
            const value = event.target.value
            setRaw(value)
            if (value.trim() === "") {
              onChange({ videoId: undefined })
            } else {
              const videoId = parseYouTubeId(value)
              if (videoId !== null) onChange({ videoId })
            }
          }}
        />
        <p id={`${id}-help`} className="text-[10px] text-gray-500">
          Usa un enlace de YouTube o un ID de 11 caracteres. Se aplica al escribir
          si es v&aacute;lido; al vaciar el campo se elimina el ID. Los cambios afectan
          al documento abierto. El video puede
          ser p&uacute;blico o no listado y debe permitir su inserci&oacute;n.
        </p>
        {invalid && (
          <p id={`${id}-error`} role="status" className="text-xs text-red-400">
            URL o ID no v&aacute;lido. Se conserva el &uacute;ltimo ID v&aacute;lido
            hasta que escribas uno v&aacute;lido o vac&iacute;es el campo.
          </p>
        )}
      </fieldset>

      <fieldset className="flex min-w-0 flex-col gap-2 border-t border-white/10 pt-3">
        <legend className="text-xs uppercase text-gray-500">Rotaci&oacute;n</legend>
        <label htmlFor={`${id}-slider`} className="text-xs text-gray-400">
          Inclinaci&oacute;n entre -180 y 180 grados
        </label>
        <input
          id={`${id}-slider`}
          type="range"
          min={-180}
          max={180}
          step={1}
          className="w-full"
          value={Math.max(-180, Math.min(180, rotate))}
          onChange={(event) => onChange({ rotate: event.target.valueAsNumber })}
        />
        <label htmlFor={`${id}-degrees`} className="text-xs text-gray-400">
          Grados (sin l&iacute;mite de rango)
        </label>
        <div className="flex items-center gap-2">
          <input
            id={`${id}-degrees`}
            type="number"
            step="any"
            className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded px-2 py-1"
            value={rotate}
            onChange={(event) => {
              const value = event.target.valueAsNumber
              if (Number.isFinite(value)) onChange({ rotate: value })
            }}
          />
          <button
            type="button"
            className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
            onClick={() => onChange({ rotate: 0 })}
          >
            Restablecer a 0
          </button>
        </div>
      </fieldset>

      <label className="flex items-center gap-2 border-t border-white/10 pt-3">
        <input
          type="checkbox"
          checked={overlay.visible}
          onChange={(event) => onChange({ visible: event.target.checked })}
        />
        <span className="text-xs text-gray-400">Visible al cargar la p&aacute;gina</span>
      </label>
    </div>
  )
}
