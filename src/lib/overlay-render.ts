"use client"

import type { PageOverlay } from "@/types/overlay"

/**
 * Registro compartido por libro/init: permite que un botón "toggleTarget"
 * encuentre y muestre/oculte otro overlay de la misma página, y evita
 * recrear objetos Audio en cada clic.
 */
export interface OverlayRegistry {
  byId: Map<string, HTMLElement>
  audio: Map<string, HTMLAudioElement>
  videos: HTMLIFrameElement[]
  timers: Map<string, ReturnType<typeof setTimeout>>
  disposed: boolean
}

export function createOverlayRegistry(): OverlayRegistry {
  return { byId: new Map(), audio: new Map(), videos: [], timers: new Map(), disposed: false }
}

export function disposeOverlayRegistry(registry: OverlayRegistry) {
  registry.disposed = true
  registry.timers.forEach(clearTimeout)
  registry.timers.clear()
  pauseAllAudio(registry)
  pauseAllVideos(registry)
  registry.videos.forEach(iframe => iframe.removeAttribute("src"))
  registry.byId.clear()
  registry.audio.clear()
  registry.videos.length = 0
}

/**
 * Pausa todos los videos de YouTube embebidos, vía postMessage (requiere que
 * el iframe se haya cargado con `enablejsapi=1`). Se llama en cada "flip"
 * de página, para que un video no siga sonando de fondo al pasar de hoja.
 */
export function pauseAllVideos(registry: OverlayRegistry) {
  registry.videos.forEach((iframe) => {
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: "pauseVideo", args: [] }),
      "*"
    )
  })
}

/**
 * Detiene TODOS los audios de overlays (botones con sonido, etc.) al pasar
 * de página — no solo pausa, resetea a 0 para que la próxima vez que se
 * toque ese botón arranque desde el principio, no desde donde quedó.
 */
export function pauseAllAudio(registry: OverlayRegistry) {
  registry.audio.forEach((audio) => {
    audio.pause()
    audio.currentTime = 0
  })
}

/**
 * Crea el overlay de un video de YouTube embebido directo en la página
 * (sin modal). Soporta rotación por si el video fue grabado en vertical.
 */
export function buildVideoElement(overlay: PageOverlay, registry: OverlayRegistry): HTMLElement {
  const el = document.createElement("div")
  el.dataset.overlayId = overlay.id
  el.dataset.overlayType = "video"
  el.style.position = "absolute"
  el.style.left = `${overlay.x}%`
  el.style.top = `${overlay.y}%`
  el.style.width = `${overlay.w}%`
  el.style.height = `${overlay.h}%`
  el.style.overflow = "hidden"
  el.style.borderRadius = "8px"
  el.style.zIndex = "5"

  const rotate = overlay.rotate ?? 0
  if (rotate !== 0) {
    // Inclinación decorativa (para calzar con un elemento del diseño, ej.
    // una tarjeta/polaroid torcida) — gira sobre su propio centro, sin
    // tocar el tamaño de la caja.
    el.style.transform = `rotate(${rotate}deg)`
  }

  if (overlay.videoId) {
    const iframe = document.createElement("iframe")
    iframe.src = `https://www.youtube-nocookie.com/embed/${overlay.videoId}?enablejsapi=1&rel=0&playsinline=1`
    iframe.style.cssText = "width:100%;height:100%;border:0;display:block;"
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    iframe.allowFullscreen = true
    el.appendChild(iframe)
    registry.videos.push(iframe)
  } else {
    el.style.background = "rgba(0,0,0,.4)"
    el.style.display = "flex"
    el.style.alignItems = "center"
    el.style.justifyContent = "center"
    el.style.color = "#fff"
    el.style.fontSize = "1.5rem"
    el.textContent = "▶️"
  }

  if (!overlay.visible) el.style.display = "none"
  registry.byId.set(overlay.id, el)

  return el
}

/**
 * Crea el elemento DOM de un overlay (imagen/webp/gif o botón) y lo cablea
 * con su acción. page-flip no usa React para renderizar las páginas, así
 * que esto también es DOM puro, consistente con el resto de FlipBook.tsx.
 */
export function buildOverlayElement(
  overlay: PageOverlay,
  registry: OverlayRegistry
): HTMLElement {
  const el = document.createElement("div")
  el.dataset.overlayId = overlay.id
  el.dataset.overlayType = overlay.type
  el.style.position = "absolute"
  el.style.left = `${overlay.x}%`
  el.style.top = `${overlay.y}%`
  el.style.width = `${overlay.w}%`
  el.style.height = `${overlay.h}%`
  el.style.pointerEvents = overlay.clickable ? "auto" : "none"
  el.style.cursor = overlay.clickable ? "pointer" : "default"
  el.style.zIndex = "5"
  el.style.display = overlay.visible ? (overlay.type === "button" ? "flex" : "block") : "none"

  if (overlay.type === "image" && overlay.src) {
    const img = document.createElement("img")
    img.src = overlay.src
    img.draggable = false
    img.alt = ""
    img.style.cssText = `width:100%;height:100%;object-fit:${overlay.fit ?? "contain"};display:block;`
    el.appendChild(img)
  } else if (overlay.type === "button") {
    el.style.alignItems = "center"
    el.style.justifyContent = "center"
    el.style.background = "transparent"

    if (overlay.src) {
      // Botón con imagen propia (ej: un ícono ilustrado a juego con el libro)
      const img = document.createElement("img")
      img.src = overlay.src
      img.draggable = false
      img.alt = ""
      img.style.cssText = `width:100%;height:100%;object-fit:${overlay.fit ?? "contain"};display:block;`
      el.appendChild(img)
    } else {
      // Fallback: emoji/texto corto si el botón no tiene imagen propia
      el.style.fontSize = "1.6rem"
      el.textContent = overlay.icon ?? "🔊"
    }
  }

  registry.byId.set(overlay.id, el)

  if (overlay.clickable) {
    // page-flip empieza a trackear el drag desde mousedown/touchstart, no desde click.
    // Si solo frenamos el click, la página ya empezó a "doblarse" antes de que
    // el clic llegue a completarse. Frenamos el gesto lo antes posible.
    const stop = (e: Event) => e.stopPropagation()
    el.addEventListener("mousedown", stop)
    el.addEventListener("touchstart", stop, { passive: true })
    el.addEventListener("pointerdown", stop)

    el.addEventListener("click", (e) => {
      e.stopPropagation()
      if (registry.disposed || !el.isConnected) return

      // El sonido es independiente de la acción: cualquier overlay clickeable
      // puede reproducir audio, además de lo que haga su acción principal.
      if (overlay.audioSrc) {
        let audio = registry.audio.get(overlay.id)
        if (!audio) {
          audio = new Audio(overlay.audioSrc)
          registry.audio.set(overlay.id, audio)
        }
        audio.currentTime = 0
        audio.play().catch(() => {})
      }

      if (overlay.action === "toggleTarget" && overlay.targetIds?.length) {
        overlay.targetIds.forEach((targetId) => {
          const target = registry.byId.get(targetId)
          if (target) {
            const isHidden = target.style.display === "none"
            const displayValue = target.dataset.overlayType === "button" ? "flex" : "block"
            target.style.display = isHidden ? displayValue : "none"
          }
        })
      }

      if (overlay.action === "timedSwap" && overlay.targetIds?.length) {
        // Botón estático → se oculta a sí mismo, muestra la(s) animación(es),
        // y pasado `durationMs` revierte todo automáticamente.
        const displaySelf = overlay.type === "button" ? "flex" : "block"
        el.style.display = "none"

        overlay.targetIds.forEach((targetId) => {
          const target = registry.byId.get(targetId)
          if (target) {
            target.style.display = target.dataset.overlayType === "button" ? "flex" : "block"
          }
        })

        const duration = overlay.durationMs ?? 3000
        clearTimeout(registry.timers.get(overlay.id))
        const timer = setTimeout(() => {
          registry.timers.delete(overlay.id)
          if (registry.disposed || !el.isConnected) return
          overlay.targetIds!.forEach((targetId) => {
            const target = registry.byId.get(targetId)
            if (target) target.style.display = "none"
          })
          el.style.display = displaySelf
        }, duration)
        registry.timers.set(overlay.id, timer)
      }

      if (overlay.action === "link" && overlay.linkUrl) {
        window.open(overlay.linkUrl, "_blank", "noopener,noreferrer")
      }
    })
  }

  return el
}

/**
 * Crea el hotspot de un overlay tipo "reveal" (efecto "equipo"): recorta con
 * clip-path circular la FOTO COMPLETA de la página (revealImg — misma
 * composición y tamaño en píxeles que la imagen de fieltro), en el punto
 * exacto del hotspot, revelando la foto real ahí y mostrando una tarjeta con
 * nombre/cargo/bio. En dispositivos con mouse se activa con hover; en touch
 * (tablet/celular, sin mouse) se activa con tap.
 */
export function buildRevealHotspot(
  overlay: PageOverlay,
  revealImg: HTMLImageElement,
  pageEl: HTMLElement,
  cardBgUrl?: string
): HTMLElement {
  const hs = document.createElement("div")
  hs.dataset.overlayId = overlay.id
  hs.dataset.overlayType = "reveal"
  hs.style.position = "absolute"
  hs.style.left = `${overlay.x}%`
  hs.style.top = `${overlay.y}%`
  hs.style.width = `${overlay.w}%`
  hs.style.height = `${overlay.h}%`
  hs.style.borderRadius = "50%"
  hs.style.cursor = "pointer"
  hs.style.background = "transparent"
  hs.style.zIndex = "5"

  const cx = overlay.x + overlay.w / 2
  const cy = overlay.y + overlay.h / 2
  const radiusPct = (Math.max(overlay.w, overlay.h) / 2) * 1.15

  let card: HTMLElement | null = null
  let open = false

  const closeReveal = () => {
    revealImg.style.clipPath = "circle(0% at 50% 50%)"
    revealImg.style.setProperty("-webkit-clip-path", "circle(0% at 50% 50%)")
    if (card) {
      card.remove()
      card = null
    }
    open = false
    hs.removeAttribute("data-reveal-open")
  }

  const buildCard = () => {
    // Medimos el tamaño real de la página en pantalla para posicionar la
    // tarjeta en píxeles: mezclar % con un ancho fijo (230px) era lo que
    // hacía que en páginas angostas (ej. la izquierda de un libro) la
    // tarjeta terminara tapando el propio círculo revelado.
    const rect = pageEl.getBoundingClientRect()
    const cardWidthPx = Math.min(230, rect.width * 0.62)
    const marginPx = 10
    const hotspotCenterXpx = (cx / 100) * rect.width
    const hotspotCenterYpx = (cy / 100) * rect.height
    const hotspotRadiusXpx = (overlay.w / 2 / 100) * rect.width

    let leftPx: number
    if (cx <= 50) {
      leftPx = hotspotCenterXpx + hotspotRadiusXpx + marginPx
    } else {
      leftPx = hotspotCenterXpx - hotspotRadiusXpx - marginPx - cardWidthPx
    }
    leftPx = Math.max(4, Math.min(rect.width - cardWidthPx - 4, leftPx))

    let topPx = hotspotCenterYpx - 70
    topPx = Math.max(4, Math.min(rect.height - 40, topPx))

    const box = document.createElement("div")
    box.style.position = "absolute"
    box.style.zIndex = "20"
    box.style.width = `${cardWidthPx}px`
    box.style.borderRadius = "14px"
    box.style.padding = "14px 16px"
    box.style.boxShadow = "0 8px 32px rgba(0,0,0,.25)"
    box.style.pointerEvents = "none"
    box.style.left = `${leftPx}px`
    box.style.top = `${topPx}px`

    if (cardBgUrl) {
      // Color sólido de respaldo SIEMPRE presente: si la textura tiene partes
      // transparentes (común en webp/png) o tarda en cargar, la tarjeta sigue
      // siendo 100% opaca en vez de dejar ver la página de atrás.
      box.style.backgroundColor = "#faf6ee"
      // 100% 100% (estirar) en vez de "cover" (recortar): esta textura es un
      // diseño de tarjeta completo (con su propio borde), no un patrón plano,
      // así que necesita verse ENTERO y no un recorte distinto según el
      // tamaño de cada tarjeta.
      box.style.backgroundImage = `url(${cardBgUrl})`
      box.style.backgroundSize = "118% 118%"
      box.style.backgroundPosition = "center"
      box.style.backgroundRepeat = "no-repeat"
    } else {
      box.style.background = "rgba(255,255,255,.97)"
    }

    const avatarColor = overlay.avatarColor || "#4a6cf7"
    const initials = (overlay.name || "").trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase()

    const header = document.createElement("div")
    header.style.cssText = "display:flex;align-items:center;gap:10px;margin-bottom:10px;"

    const avatar = document.createElement("div")
    avatar.style.cssText = `width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;background:${avatarColor};flex-shrink:0;font-size:14px;`
    avatar.textContent = initials

    const nameWrap = document.createElement("div")
    const nameEl = document.createElement("div")
    nameEl.style.cssText = "font-weight:700;color:#1a1a2e;line-height:1.2;font-size:14px;"
    nameEl.textContent = overlay.name || ""
    const roleEl = document.createElement("div")
    roleEl.style.cssText = `display:inline-block;margin-top:4px;font-size:11px;font-weight:600;color:#fff;background:${avatarColor};border-radius:20px;padding:2px 9px;`
    roleEl.textContent = overlay.role || ""
    nameWrap.appendChild(nameEl)
    nameWrap.appendChild(roleEl)

    header.appendChild(avatar)
    header.appendChild(nameWrap)

    const divider = document.createElement("div")
    divider.style.cssText = "height:1px;background:#eee;margin:10px 0;"

    const bioEl = document.createElement("div")
    bioEl.style.cssText = "font-size:12px;color:#555;line-height:1.55;font-weight:500;"
    bioEl.textContent = overlay.bio || ""

    box.appendChild(header)
    box.appendChild(divider)
    box.appendChild(bioEl)
    return box
  }

  const openReveal = () => {
    if (open) return
    // Cierra cualquier otro punto de revelado abierto en esta misma página
    pageEl.querySelectorAll<HTMLElement>("[data-reveal-open]").forEach((el) => {
      el.dispatchEvent(new Event("forceclose"))
    })
    revealImg.style.clipPath = `circle(${radiusPct}% at ${cx}% ${cy}%)`
    revealImg.style.setProperty("-webkit-clip-path", `circle(${radiusPct}% at ${cx}% ${cy}%)`)
    open = true
    hs.setAttribute("data-reveal-open", "true")
    card = buildCard()
    pageEl.appendChild(card)

    // La altura de la tarjeta depende de cuánto texto tenga la bio (varía
    // por persona), así que recién con la tarjeta ya en el DOM podemos medir
    // su alto real. Si se pasa del borde inferior de la página, la subimos.
    requestAnimationFrame(() => {
      if (!card || !pageEl.isConnected) return
      const pageRect = pageEl.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      const overflowPx = cardRect.bottom - (pageRect.bottom - 8)
      if (overflowPx > 0) {
        const currentTop = parseFloat(card.style.top) || 0
        card.style.top = `${Math.max(4, currentTop - overflowPx)}px`
      }
    })
  }

  hs.addEventListener("forceclose", closeReveal)

  // Dispositivos con mouse real (hover:hover) → se activa al pasar el mouse.
  // Touch (tablet/celular, sin mouse) → se activa al tocar (tap = toggle).
  const hasHover =
    typeof window !== "undefined" && window.matchMedia("(hover: hover) and (pointer: fine)").matches

  if (hasHover) {
    hs.addEventListener("mouseenter", openReveal)
    hs.addEventListener("mouseleave", closeReveal)
  } else {
    hs.addEventListener("click", (e) => {
      e.stopPropagation()
      if (open) {
        closeReveal()
      } else {
        openReveal()
      }
    })
  }

  // Igual que los demás overlays: frenar el gesto antes de que page-flip
  // lo interprete como el inicio de un giro de página.
  const stop = (ev: Event) => ev.stopPropagation()
  hs.addEventListener("mousedown", stop)
  hs.addEventListener("touchstart", stop, { passive: true })
  hs.addEventListener("pointerdown", stop)

  return hs
}
