"use client"

import { useEffect, useRef } from "react"

const pageRenderCache = new Map<number, HTMLCanvasElement>()
const CACHE_RADIUS = 3

// Función para resetear todo si cambias de libro
export const clearPdfCache = () => {
  pageRenderCache.forEach(canvas => {
    canvas.width = 0;
    canvas.height = 0;
  });
  pageRenderCache.clear();
};

export default function PdfPage({ pdf, pageNumber }: { pdf: any; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const renderTaskRef = useRef<any>(null)

  useEffect(() => {
    // 1. Validación de seguridad
    if (!pdf) {
        console.warn("Esperando objeto PDF...");
        return;
    }
    if (!canvasRef.current) return;

    let cancelled = false;
    let currentPageObj: any = null;

    const renderPage = async () => {
      // Cancelar tarea previa si existe
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!; // Quitamos el alpha:false temporalmente para descartar errores

      // 2. Lógica de Caché
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
        
        // Medidas seguras
        const w = typeof window !== 'undefined' ? window.innerWidth : 800;
        const h = typeof window !== 'undefined' ? window.innerHeight : 600;

        const scale = w < 640 
          ? (w * 0.9) / baseViewport.width 
          : (h * 0.8) / baseViewport.height;

        const viewport = currentPageObj.getViewport({ scale: scale || 1 });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        // Pintar fondo blanco preventivo
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const renderTask = currentPageObj.render({
          canvasContext: ctx,
          viewport: viewport,
        });

        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!cancelled) {
          const offscreen = document.createElement("canvas");
          offscreen.width = canvas.width;
          offscreen.height = canvas.height;
          offscreen.getContext("2d")!.drawImage(canvas, 0, 0);
          pageRenderCache.set(pageNumber, offscreen);
        }

        // Limpieza de memoria
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

      } catch (e: any) {
        if (e?.name !== "RenderingCancelledException") console.error("Error:", e);
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
      display: 'inline-block', // Para que el div se ajuste al tamaño del canvas
      lineHeight: 0            // Elimina espacios extra verticales por defecto de HTML
    }}>
      <canvas
        ref={canvasRef}
        style={{
          display: "block",
          background: "white",
          // Quitamos el margin: "0 auto"
          maxWidth: "100%",
          maxHeight: "100%",
          boxShadow: pageNumber % 2 === 0 
            ? "inset -5px 0 10px rgba(0,0,0,0.1)" // Sombra interna derecha para página par (efecto lomo)
            : "inset 5px 0 10px rgba(0,0,0,0.1)"  // Sombra interna izquierda para impar
        }}
      />
    </div>
  );
}