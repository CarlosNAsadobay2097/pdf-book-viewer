"use client"

import { useEffect, useRef } from "react"
// Importamos los tipos específicos para eliminar los errores de las capturas
import type { 
  PDFDocumentProxy, 
  PDFPageProxy, 
  RenderTask, 
  PageViewport 
} from "pdfjs-dist"

const pageRenderCache = new Map<number, HTMLCanvasElement>()
const CACHE_RADIUS = 3

export const clearPdfCache = () => {
  pageRenderCache.forEach(canvas => {
    canvas.width = 0;
    canvas.height = 0;
  });
  pageRenderCache.clear();
};

interface PdfPageProps {
  pdf: PDFDocumentProxy | null;
  pageNumber: number;
}

export default function PdfPage({ pdf, pageNumber }: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Cambiamos 'any' por el tipo correcto de la librería
  const renderTaskRef = useRef<RenderTask | null>(null)

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;

    let cancelled = false;
    let currentPageObj: PDFPageProxy | null = null;

    const renderPage = async () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d", { alpha: false })!;

      // 1. Recuperar de caché si existe
      if (pageRenderCache.has(pageNumber)) {
        const cached = pageRenderCache.get(pageNumber)!;
        canvas.width = cached.width;
        canvas.height = cached.height;
        ctx.drawImage(cached, 0, 0);
        return;
      }

      try {
        currentPageObj = await pdf.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = currentPageObj.getViewport({ scale: 1 });
        
        // --- LÓGICA DE TAMAÑO FIJO ---
        // Usamos dimensiones de referencia para que no se "infle" el canvas
        const w = window.innerWidth;
        const h = window.innerHeight;

        const scale = w < 1024 
          ? (w * 0.85) / baseViewport.width 
          : (h * 0.7) / baseViewport.height;

        const viewport: PageViewport = currentPageObj.getViewport({ scale: scale || 1 });

        // Ajustamos el canvas físicamente
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Limpieza preventiva
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Renderizado
        const renderTask = currentPageObj.render({
          canvasContext: ctx,
          viewport: viewport,
          // Añadimos la referencia al canvas para cumplir con la interfaz de la librería
          canvas: canvas 
        });

        renderTaskRef.current = renderTask;
        
        try {
          await renderTask.promise;
        } catch (err: unknown) {
          // Manejo de errores sin usar 'any'
          const error = err as { name?: string };
          if (error.name === "RenderingCancelledException") return;
          throw err;
        }

        if (!cancelled) {
          const offscreen = document.createElement("canvas");
          offscreen.width = canvas.width;
          offscreen.height = canvas.height;
          const offscreenCtx = offscreen.getContext("2d");
          if (offscreenCtx) {
            offscreenCtx.drawImage(canvas, 0, 0);
            pageRenderCache.set(pageNumber, offscreen);
          }
        }

        // Limpieza de caché (Mantiene memoria optimizada)
        const pagesToKeep = new Set([
          1, 
          ...Array.from({ length: CACHE_RADIUS * 2 + 1 }, (_, i) => pageNumber - CACHE_RADIUS + i)
        ]);

        for (const [key, cachedCanvas] of pageRenderCache.entries()) {
          if (!pagesToKeep.has(key)) {
            cachedCanvas.width = 0;
            cachedCanvas.height = 0;
            pageRenderCache.delete(key);
          }
        }

        currentPageObj.cleanup();

      } catch (e) {
        console.error(`Error en renderizado:`, e);
      }
    };

    renderPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current) renderTaskRef.current.cancel();
    };
  }, [pdf, pageNumber]);

  return (
    <div style={{ 
      display: 'inline-block', 
      lineHeight: 0, 
      position: 'relative',
      transformStyle: "preserve-3d", 
      backfaceVisibility: "hidden"
    }}>
      <canvas
        ref={canvasRef}
        className="transition-opacity duration-300 ease-in"
        style={{
          display: "block",
          background: "white",
          // Estos límites aseguran que la página nunca "explote" de tamaño
          maxWidth: "100%",
          maxHeight: "75vh",
          width: "auto",
          height: "auto",
          objectFit: "contain",
          boxShadow: pageNumber % 2 === 0 
            ? "inset -15px 0 30px -10px rgba(0,0,0,0.3), 10px 10px 20px rgba(0,0,0,0.2)" 
            : "inset 15px 0 30px -10px rgba(0,0,0,0.3), -10px 10px 20px rgba(0,0,0,0.2)"
        }}
      />
    </div>
  );
}