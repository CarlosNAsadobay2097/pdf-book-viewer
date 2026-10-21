// types/overlay.ts
// Tipos compartidos entre el visor (FlipBook), el editor (/editor) y la API (/api/manifest)

export type OverlayType = "image" | "button" | "reveal" | "video"
export type OverlayAction = "none" | "toggleTarget" | "timedSwap" | "link"

export interface PageOverlay {
  id: string
  type: OverlayType
  /** Ruta a la imagen/webp/gif. Requerido si type === "image". Opcional en "button" (reemplaza al ícono/emoji). */
  src?: string
  /** Emoji o texto corto para representar un "button" cuando no tiene src propio. */
  icon?: string
  /** Posición y tamaño en % relativo a la página (no en px), para que escale con cualquier resize/zoom. */
  x: number
  y: number
  w: number
  h: number
  /** Visibilidad al cargar la página (permite overlays "ocultos" que se revelan con un botón). */
  visible: boolean
  /** Si responde a clics. */
  clickable: boolean
  action: OverlayAction
  /**
   * Sonido a reproducir en CADA clic, independiente de `action`.
   * Un botón puede sonar y además togglear/activar otros overlays a la vez.
   */
  audioSrc?: string
  /** ids de otros overlays de la misma página a mostrar/ocultar u activar temporalmente. Usado si action === "toggleTarget" o "timedSwap". */
  targetIds?: string[]
  /** Duración en milisegundos que quedan visibles los targetIds antes de revertir. Usado si action === "timedSwap". */
  durationMs?: number
  /** Usado si action === "link". */
  linkUrl?: string
  /**
   * Cómo encaja la imagen dentro de su caja (solo aplica si hay `src` de imagen):
   * "contain" (default) = se ve completa, se encoge proporcionalmente si no entra.
   * "cover" = mantiene su tamaño/proporción real y la caja actúa de ventana/máscara,
   *           recortando lo que no entra en vez de encoger el dibujo entero.
   */
  fit?: "contain" | "cover"
  /** Campos usados solo si type === "reveal" (punto de revelado tipo "equipo"): */
  name?: string
  role?: string
  bio?: string
  avatarColor?: string
  /** Campos usados solo si type === "video": */
  videoId?: string        // ID del video de YouTube (ej: "dQw4w9WgXcQ")
  rotate?: number         // Rotación en grados (0, 90, 180, 270...), por si el video es vertical
}

export interface Manifest {
  name: string
  source: string
  pages: number
  format: string
  basePath: string
  /** Clave = número de página, 1-indexado (coincide con page-001, page-002, ...), como string. */
  overlays?: Record<string, PageOverlay[]>
  /**
   * Foto real de esta página (mismo tamaño en píxeles y misma composición que
   * la imagen de fieltro), revelada con máscara circular a través de los
   * overlays tipo "reveal" de esa misma página. Misma clave que overlays.
   */
  revealImages?: Record<string, string>
  /** Imagen de textura de fondo para TODAS las tarjetas de bio del libro (opcional). */
  revealCardBg?: string
  /** Índice/tabla de contenidos del libro: entradas con título y a qué página saltar. */
  tableOfContents?: { id: string; label: string; page: number }[]
  /** PDF descargable para los lectores (versión comprimida, distinta del PDF fuente de conversión). */
  downloadPdfUrl?: string
}
