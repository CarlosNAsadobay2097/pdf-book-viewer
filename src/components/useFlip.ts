"use client"

import { useCallback, useRef, useState } from "react"

// ─── Tipos ────────────────────────────────────────────────────────
export type FlipDirection = "next" | "prev"

export interface FlipState {
  // Página volando actualmente (0 = sin animación)
  flyingPage: number
  direction: FlipDirection | null
  // Progreso del drag 0..1 (null = animación automática)
  dragProgress: number | null
}

interface UseFlipOptions {
  currentPage: number
  numPages: number
  isDesktop: boolean
  onPageChange: (page: number) => void
}

const FLIP_DURATION = 600  // ms
const DRAG_THRESHOLD = 0.15 // fracción mínima para confirmar flip

// ─── Hook principal ───────────────────────────────────────────────
export function useFlip({
  currentPage,
  numPages,
  isDesktop,
  onPageChange,
}: UseFlipOptions) {
  const [flip, setFlip] = useState<FlipState>({
    flyingPage: 0,
    direction: null,
    dragProgress: null,
  })

  const isAnimating = useRef(false)
  const dragStartX  = useRef(0)
  const dragPageRef = useRef(0)
  const dragDirRef  = useRef<FlipDirection | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Utilidades ─────────────────────────────────────────────────
  const isCover    = currentPage === 1
  const showDouble = isDesktop && !isCover && currentPage + 1 <= numPages
  const isLastPage = isDesktop
    ? isCover ? currentPage >= numPages : currentPage + 1 >= numPages
    : currentPage >= numPages

  const nextPageAfterFlip = useCallback((dir: FlipDirection) => {
    if (dir === "next") {
      return currentPage === 1
        ? Math.min(2, numPages)
        : Math.min(currentPage + 2, numPages)
    }
    return currentPage <= 2 ? 1 : Math.max(currentPage - 2, 1)
  }, [currentPage, numPages])

  const flyingPageFor = useCallback((dir: FlipDirection) => {
    if (dir === "next") return showDouble ? currentPage + 1 : currentPage
    const next = nextPageAfterFlip("prev")
    return next + (isDesktop && next !== 1 ? 1 : 0)
  }, [currentPage, showDouble, isDesktop, nextPageAfterFlip])

  // ── Flip animado automático ────────────────────────────────────
  const triggerFlip = useCallback((dir: FlipDirection) => {
    if (isAnimating.current) return
    if (dir === "next" && isLastPage) return
    if (dir === "prev" && currentPage === 1) return

    isAnimating.current = true

    setFlip({
      flyingPage: flyingPageFor(dir),
      direction: dir,
      dragProgress: null, // animación automática
    })

    setTimeout(() => {
      onPageChange(nextPageAfterFlip(dir))
      setFlip({ flyingPage: 0, direction: null, dragProgress: null })
      isAnimating.current = false
    }, FLIP_DURATION)
  }, [isLastPage, currentPage, flyingPageFor, nextPageAfterFlip, onPageChange])

  // ── Drag handlers ──────────────────────────────────────────────
  const onDragStart = useCallback((clientX: number) => {
    if (isAnimating.current || !containerRef.current) return

    const rect = containerRef.current.getBoundingClientRect()
    const relX = clientX - rect.left
    const midX = rect.width / 2

    // Determinar dirección según en qué mitad empieza el drag
    let dir: FlipDirection
    if (relX > midX) {
      if (isLastPage) return
      dir = "next"
    } else {
      if (currentPage === 1) return
      dir = "prev"
    }

    dragStartX.current  = clientX
    dragDirRef.current  = dir
    dragPageRef.current = flyingPageFor(dir)

    setFlip({
      flyingPage: dragPageRef.current,
      direction: dir,
      dragProgress: 0,
    })
  }, [isLastPage, currentPage, flyingPageFor])

  const onDragMove = useCallback((clientX: number) => {
    if (!dragDirRef.current || !containerRef.current) return

    const rect      = containerRef.current.getBoundingClientRect()
    const halfWidth = rect.width / (showDouble ? 2 : 1)
    const delta     = dragStartX.current - clientX
    const progress  = Math.min(Math.max(Math.abs(delta) / halfWidth, 0), 1)

    setFlip(prev => ({ ...prev, dragProgress: progress }))
  }, [showDouble])

  const onDragEnd = useCallback((clientX: number) => {
    if (!dragDirRef.current || !containerRef.current) return

    const rect      = containerRef.current.getBoundingClientRect()
    const halfWidth = rect.width / (showDouble ? 2 : 1)
    const delta     = Math.abs(dragStartX.current - clientX)
    const progress  = delta / halfWidth

    const confirmed = progress >= DRAG_THRESHOLD
    const dir       = dragDirRef.current

    if (confirmed) {
      // Completar el flip animando desde la posición actual hasta el final
      isAnimating.current = true
      setFlip(prev => ({ ...prev, dragProgress: null })) // activa CSS transition

      setTimeout(() => {
        onPageChange(nextPageAfterFlip(dir))
        setFlip({ flyingPage: 0, direction: null, dragProgress: null })
        isAnimating.current = false
      }, FLIP_DURATION)
    } else {
      // Cancelar — animar de vuelta a 0
      setFlip(prev => ({ ...prev, dragProgress: null })) // CSS transition a 0
      setTimeout(() => {
        setFlip({ flyingPage: 0, direction: null, dragProgress: null })
      }, FLIP_DURATION)
    }

    dragDirRef.current = null
  }, [showDouble, nextPageAfterFlip, onPageChange])

  // ── Event handlers unificados (mouse + touch) ──────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    onDragStart(e.clientX)
  }, [onDragStart])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragDirRef.current) return
    onDragMove(e.clientX)
  }, [onDragMove])

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragDirRef.current) return
    onDragEnd(e.clientX)
  }, [onDragEnd])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    onDragStart(e.touches[0].clientX)
  }, [onDragStart])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragDirRef.current) return
    e.preventDefault() // evitar scroll mientras arrastra
    onDragMove(e.touches[0].clientX)
  }, [onDragMove])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!dragDirRef.current) return
    onDragEnd(e.changedTouches[0].clientX)
  }, [onDragEnd])

  return {
    flip,
    containerRef,
    isCover,
    showDouble,
    isLastPage,
    triggerFlip,
    dragHandlers: {
      onMouseDown:  handleMouseDown,
      onMouseMove:  handleMouseMove,
      onMouseUp:    handleMouseUp,
      onMouseLeave: handleMouseUp,
      onTouchStart: handleTouchStart,
      onTouchMove:  handleTouchMove,
      onTouchEnd:   handleTouchEnd,
    },
  }
}
