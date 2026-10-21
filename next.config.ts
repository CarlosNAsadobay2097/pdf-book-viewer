import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: false, // oculta el icono "N" de Next.js en desarrollo
  reactCompiler: true,

  // Las rutas /api/manifest y /api/upload leen/escriben archivos de
  // public/pages/ con rutas armadas en tiempo de ejecución (fs.readFile /
  // fs.writeFile). Next no puede saber de antemano cuál archivo exacto va
  // a tocar, así que por defecto empaqueta TODA public/pages dentro de la
  // función serverless (imágenes, audios, PDFs de los 3 libros) — eso fue
  // lo que hizo que la función superara el límite de 250 MB de Netlify.
  // Esos archivos ya se sirven como estáticos (por eso el libro y el botón
  // de descarga funcionan igual), así que los excluimos de la función.
  outputFileTracingExcludes: {
    "*": ["./public/pages/**", "./public/*.pdf"],
  },
};

export default nextConfig;
