"use client"

import AssetDropzone from "@/components/AssetDropzone"
import EditorVideoSettings from "@/components/EditorVideoSettings"
import type { Manifest, OverlayAction, PageOverlay } from "@/types/overlay"

interface EditorPropertiesProps {
  manifest: Manifest
  pageNum: number
  selected: PageOverlay | null
  overlays: PageOverlay[]
  aspectLocked: boolean
  onAspectLock: (locked: boolean) => void
  onChange: (patch: Partial<PageOverlay>) => void
  onRemove: () => void
  onDeselect: () => void
}

const typeNames = {
  image: "Imagen",
  button: "Bot\u00f3n interactivo",
  reveal: "Punto de revelado",
  video: "Video",
}

export default function EditorProperties({
  manifest, pageNum, selected, overlays, aspectLocked,
  onAspectLock, onChange, onRemove, onDeselect,
}: EditorPropertiesProps) {
  const inputClass = "min-w-0 w-full rounded border border-white/10 bg-[#15191f] px-2 py-1.5 text-sm text-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
  const labelClass = "flex min-w-0 flex-col gap-1.5 text-xs text-gray-400"
  const sectionClass = "flex min-w-0 flex-col gap-3 border-t border-white/10 pt-4"
  const interactive = selected?.type === "image" || selected?.type === "button"
  const targets = overlays.filter((element) => element.id !== selected?.id)

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col bg-[#15191f] text-sm text-white [&_input]:min-w-0 [&_input[type=checkbox]]:accent-blue-500 [&_select]:min-w-0">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Propiedades</h2>
          <p className="mt-1 truncate text-xs text-gray-400">
            {selected ? typeNames[selected.type] : `P\u00e1gina ${pageNum}`}
          </p>
        </div>
        {selected && (
          <button
            type="button"
            aria-label="Cerrar selecci&oacute;n"
            title="Cerrar selecci&oacute;n"
            onClick={onDeselect}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 text-gray-400 hover:bg-white/5 hover:text-white focus-visible:outline-2 focus-visible:outline-blue-400"
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="m4 4 8 8M12 4l-8 8" />
            </svg>
          </button>
        )}
      </header>

      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 [scrollbar-gutter:stable]" role="region" aria-label="Contenido de propiedades" tabIndex={0}>
        {!selected ? (
          <div className="flex min-w-0 flex-col gap-4">
            <h3 className="font-medium">P&aacute;gina {pageNum}</h3>
            {/* The imported background has no dimensions in the manifest. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`${manifest.basePath}/page-${String(pageNum).padStart(3, "0")}.${manifest.format}`}
              alt={`Fondo de p\u00e1gina ${pageNum}`}
              className="h-48 w-full min-w-0 rounded border border-white/10 object-contain"
            />
            <p className="text-xs leading-relaxed text-gray-400">
              Esta es una p&aacute;gina importada. Su fondo no se puede editar desde este panel.
            </p>
            <div className="border-t border-white/10 pt-4">
              <p className="text-xs font-medium text-gray-200">
                {overlays.length} {overlays.length === 1 ? "elemento" : "elementos"} en esta p&aacute;gina
              </p>
              <p className="mt-2 text-xs leading-relaxed text-gray-400">
                Selecciona un elemento en el lienzo o en el panel Elementos para ver y editar sus propiedades.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <fieldset className="min-w-0">
              <legend className="mb-3 text-xs font-medium text-blue-300">Posici&oacute;n y tama&ntilde;o</legend>
              <div className="grid min-w-0 grid-cols-2 gap-3">
                {([
                  ["x", "X (%)"], ["y", "Y (%)"],
                  ["w", "Ancho (%)"], ["h", "Alto (%)"],
                ] as const).map(([field, label]) => (
                  <label key={`${selected.id}-${field}`} className={labelClass}>
                    {label}
                    <input
                      type="number"
                      step={0.1}
                      min={field === "w" || field === "h" ? 0.1 : undefined}
                      className={inputClass}
                      value={Math.round(selected[field] * 100) / 100}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber
                        if (!Number.isFinite(value) || ((field === "w" || field === "h") && value <= 0)) return
                        const patch: Partial<PageOverlay> = { [field]: value }
                        if (aspectLocked && selected.w > 0 && selected.h > 0) {
                          if (field === "w") patch.h = selected.h * value / selected.w
                          if (field === "h") patch.w = selected.w * value / selected.h
                        }
                        if ((patch.w !== undefined && !Number.isFinite(patch.w)) ||
                            (patch.h !== undefined && !Number.isFinite(patch.h))) return
                        onChange(patch)
                      }}
                    />
                  </label>
                ))}
              </div>
              <label className="mt-3 flex min-w-0 items-center gap-2 text-xs text-gray-300">
                <input type="checkbox" checked={aspectLocked} onChange={(event) => onAspectLock(event.target.checked)} />
                Mantener proporciones
              </label>
              <p className="mt-2 text-xs leading-relaxed text-gray-500">
                Porcentajes relativos a la p&aacute;gina, independientes del zoom. Los elementos pueden sobresalir del borde.
              </p>
              {!selected.visible && (
                <p className="mt-2 text-xs leading-relaxed text-gray-400">
                  Oculto al abrir el libro. En el editor se muestra semitransparente para poder editarlo.
                </p>
              )}
            </fieldset>

            <section className={sectionClass} aria-label="Apariencia">
              <h3 className="text-xs font-medium text-blue-300">Apariencia</h3>
              {interactive && (
                <>
                  <AssetDropzone
                    key={`${selected.id}-image`}
                    label={selected.type === "image" ? "Imagen / WebP / GIF" : "Imagen del bot\u00f3n (opcional)"}
                    accept="image/webp,image/gif,image/png,image/jpeg"
                    value={selected.src}
                    onChange={(url) => onChange({ src: url })}
                  />
                  {(selected.type === "image" || selected.src) && (
                    <label className={labelClass}>
                      Modo de encuadre
                      <select className={inputClass} value={selected.fit ?? "contain"} onChange={(event) => onChange({ fit: event.target.value as "contain" | "cover" })}>
                        <option value="contain">Ajustar completo</option>
                        <option value="cover">Recortar / enmascarar</option>
                      </select>
                      <span className="text-xs leading-relaxed text-gray-500">Ajustar muestra toda la imagen; recortar oculta los bordes que quedan fuera.</span>
                    </label>
                  )}
                  {selected.type === "button" && (
                    <label className={labelClass}>
                      Icono de respaldo (si no hay imagen)
                      <input className={inputClass} value={selected.icon ?? ""} onChange={(event) => onChange({ icon: event.target.value })} />
                    </label>
                  )}
                  <label className="flex min-w-0 items-center gap-2 text-xs text-gray-300">
                    <input type="checkbox" checked={selected.visible} onChange={(event) => onChange({ visible: event.target.checked })} />
                    Visible al cargar la p&aacute;gina
                  </label>
                </>
              )}

              {selected.type === "reveal" && (
                <>
                  <label className={labelClass}>
                    Nombre completo
                    <input className={inputClass} value={selected.name ?? ""} onChange={(event) => onChange({ name: event.target.value })} />
                  </label>
                  <label className={labelClass}>
                    Cargo / Rol
                    <input className={inputClass} value={selected.role ?? ""} onChange={(event) => onChange({ role: event.target.value })} />
                  </label>
                  <label className={labelClass}>
                    Biograf&iacute;a
                    <textarea rows={4} className={`${inputClass} resize-y`} value={selected.bio ?? ""} onChange={(event) => onChange({ bio: event.target.value })} />
                  </label>
                  <div className="flex min-w-0 items-end gap-2">
                    <label className={`${labelClass} shrink-0`}>
                      <span className="sr-only">Elegir color de acento</span>
                      <input type="color" className="h-9 w-9 rounded border border-white/10 bg-transparent" value={selected.avatarColor ?? "#4a6cf7"} onChange={(event) => onChange({ avatarColor: event.target.value })} />
                    </label>
                    <label className={`${labelClass} flex-1`}>
                      Color de acento (avatar/etiqueta)
                      <input className={inputClass} value={selected.avatarColor ?? "#4a6cf7"} onChange={(event) => onChange({ avatarColor: event.target.value })} />
                    </label>
                  </div>
                  <p className="text-xs leading-relaxed text-gray-400">
                    El recurso de foto real de esta p&aacute;gina se configura en el panel Revelados. Este punto revela esa foto dentro del c&iacute;rculo. Ajusta su posici&oacute;n y tama&ntilde;o para cubrir el rostro.
                  </p>
                </>
              )}

              {selected.type === "video" && (
                <EditorVideoSettings key={selected.id} overlay={selected} onChange={onChange} />
              )}
            </section>

            {interactive && (
              <section className={sectionClass} aria-label="Interacci&oacute;n">
                <h3 className="text-xs font-medium text-blue-300">Interacci&oacute;n</h3>
                <label className="flex min-w-0 items-center gap-2 text-xs text-gray-300">
                  <input type="checkbox" checked={selected.clickable} onChange={(event) => onChange({ clickable: event.target.checked })} />
                  Responde al hacer clic
                </label>
                {selected.clickable && (
                  <AssetDropzone
                    key={`${selected.id}-audio`}
                    label="Sonido al hacer clic (opcional)"
                    accept="audio/*"
                    value={selected.audioSrc}
                    onChange={(url) => onChange({ audioSrc: url })}
                  />
                )}
                <label className={labelClass}>
                  Acci&oacute;n al hacer clic
                  <select className={inputClass} value={selected.action} onChange={(event) => onChange({ action: event.target.value as OverlayAction })}>
                    <option value="none">Ninguna (solo sonido, si hay)</option>
                    <option value="toggleTarget">Mostrar/ocultar elementos</option>
                    <option value="timedSwap">Activar temporalmente y volver</option>
                    <option value="link">Abrir enlace</option>
                  </select>
                </label>
                {selected.action === "timedSwap" && (
                  <label className={labelClass}>
                    Duraci&oacute;n antes de volver (segundos)
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      className={inputClass}
                      value={(selected.durationMs ?? 3000) / 1000}
                      onChange={(event) => {
                        const value = event.target.valueAsNumber
                        const durationMs = Math.max(500, Math.round(value * 1000))
                        if (Number.isFinite(value) && Number.isFinite(durationMs)) onChange({ durationMs })
                      }}
                    />
                  </label>
                )}
                {(selected.action === "toggleTarget" || selected.action === "timedSwap") && (
                  <fieldset className="min-w-0">
                    <legend className="mb-2 text-xs text-gray-400">
                      {selected.action === "timedSwap" ? "Elementos a activar temporalmente" : "Elementos a mostrar/ocultar"}
                    </legend>
                    <div className="flex max-h-40 min-w-0 flex-col gap-2 overflow-y-auto rounded border border-white/10 bg-white/[0.02] p-2">
                      {targets.length === 0 && <p className="text-xs text-gray-500">No hay otros elementos en esta p&aacute;gina todav&iacute;a.</p>}
                      {targets.map((element) => (
                        <label key={element.id} className="flex min-w-0 items-center gap-2 text-xs text-gray-300">
                          <input
                            type="checkbox"
                            checked={selected.targetIds?.includes(element.id) ?? false}
                            onChange={(event) => {
                              const current = selected.targetIds ?? []
                              onChange({ targetIds: event.target.checked ? [...current, element.id] : current.filter((id) => id !== element.id) })
                            }}
                          />
                          <span className="min-w-0 break-words">{typeNames[element.type]} {element.id.slice(0, 8)}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {selected.action === "link" && (
                  <label className={labelClass}>
                    Direcci&oacute;n del enlace
                    <input type="url" className={inputClass} value={selected.linkUrl ?? ""} onChange={(event) => onChange({ linkUrl: event.target.value })} placeholder="https://..." />
                  </label>
                )}
              </section>
            )}
          </div>
        )}
      </div>

      {selected && (
        <footer className="shrink-0 border-t border-white/10 p-3">
          <button type="button" onClick={onRemove} className="w-full rounded border border-white/10 px-3 py-2 text-xs text-gray-400 hover:border-red-400/40 hover:bg-red-400/5 hover:text-red-300 focus-visible:outline-2 focus-visible:outline-blue-400">
            Eliminar elemento
          </button>
        </footer>
      )}
    </div>
  )
}
