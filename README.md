# PDF Book Viewer

Framework de libros virtuales interactivos con Next.js y React: visor con efecto
de paso de pagina, editor visual local y una prueba temporal en el navegador.
Permite incorporar imagenes, animaciones, audio, enlaces, videos de YouTube y
zonas de revelado. La muestra incluida utiliza `librovirtualdemo2`.

Repositorio publico: https://github.com/CarlosNAsadobay2097/pdf-book-viewer

## Libro activo y edicion local

El visor y el editor usan `librovirtualdemo2`, configurado en
`src/lib/book-config.ts`. Para trabajar con otro libro, cambia `bookConfig.id`
por el nombre de su carpeta en `public/pages/`, y ajusta su titulo y descripcion
en la misma configuracion. Las subidas tambien se guardan en el libro activo.

El flujo de trabajo es local: ejecutar `npm run dev`, editar en `/editor`,
guardar y publicar los cambios de archivos mediante Git y el hosting. No hay
base de datos ni almacenamiento persistente remoto para editar en Netlify.

### Usar tu propio PDF en local

1. Coloca el PDF en `public/`, por ejemplo `public/mi-libro.pdf`.
2. Desde la raiz del proyecto, conviertelo en imagenes y manifiesto:

```bash
node scripts/convert-pdf.mjs "public/mi-libro.pdf" --out "public/pages/mi-libro"
```

3. En `src/lib/book-config.ts`, cambia `bookConfig.id` a `"mi-libro"` y ajusta
   `title` y `description`. El identificador debe coincidir con la carpeta.
4. Ejecuta `npm run dev`. Abre `/` para ver el libro y `/editor` para editar
   y guardar sus interacciones en los archivos locales.
5. Revisa con `npm run build` y publica el codigo y los recursos mediante Git
   y tu hosting.

Usa una carpeta nueva para cada PDF diferente: el conversor puede sobrescribir
paginas y el manifiesto si reutilizas una carpeta existente. La demo ya incluye
paginas convertidas; no necesitas reconvertirla para probar el proyecto.

El campo **PDF descargable para lectores** del editor solo configura un enlace
de descarga. No convierte el PDF ni reemplaza las paginas del libro. Tampoco hay
importacion de PDF ni exportacion de proyectos desde la prueba web en esta etapa.

## Probar una copia en el navegador

Desde el visor `/`, el enlace **Editar una copia de la demo** abre `/probar`.
Esta ruta carga el manifiesto estatico y conserva una copia independiente en
memoria, sin usar las APIs de guardado o subida. No modifica la demo publicada.

- Permite editar las herramientas existentes y cargar imagenes, animaciones,
  audio y un PDF descargable como recursos temporales.
- **Previsualizar** abre el visor con los cambios actuales dentro de la misma
  pestana. Al volver se conserva la pagina y la seleccion del editor.
- **Reiniciar** descarta la prueba y vuelve a cargar la demo original.
- Recargar, cerrar o salir descarta el documento. No hay recuperacion mediante
  localStorage, IndexedDB ni almacenamiento remoto en esta etapa.
- Los archivos elegidos permanecen en el navegador y usan Object URLs. Se
  liberan cuando dejan de utilizarse, al reiniciar o al abandonar la prueba.
- Limites: 10 MiB por imagen/audio, 40 MiB por PDF, 50 recursos propios y 100 MiB
  en total. Las imagenes se validan antes de incorporarlas y admiten hasta 40 MP.
- Las miniaturas se generan en el navegador. Los videos de YouTube y otros
  enlaces externos siguen conectando con sus respectivos servicios.

El editor sigue orientado a escritorio. Esta etapa NO importa ni convierte un
PDF en paginas y NO exporta el proyecto editado; esas funciones vendran despues.

En produccion (`npm run build` y `npm run start` o un hosting), `/editor` redirige
a `/probar` y las APIs `PUT /api/manifest` y `POST /api/upload` rechazan escrituras
con HTTP 403. Para modificar los archivos locales, usar `npm run dev` y `/editor`.
El servidor de desarrollo no autentica usuarios; no debe exponerse a Internet.

Cambiar el libro activo no elimina ni oculta los otros recursos de `public/`.
Antes de distribuir el codigo fuente o desplegar una muestra publica, revisar
tambien los recursos no utilizados dentro de la carpeta demo y el historial de
Git. Una eliminacion en un commit nuevo no retira archivos de commits anteriores.
Esta seleccion de demo no sustituye una revision de permisos sobre el contenido.

### Recursos usados por la demo

La referencia vigente es `public/pages/librovirtualdemo2/manifest.json`:
conservar ese archivo, las paginas indicadas por `pages` y `format`, y los recursos
de imagen, audio, revelado y descarga que referencia, incluso si empiezan ocultos.
La demo se ha actualizado con nuevos ejemplos; no usar listados historicos de
archivos para decidir una limpieza. Las carpetas pueden contener recursos no
utilizados. Comprobar las referencias no acredita permisos de distribucion.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Miniaturas del editor

En modo local, el panel de imagenes solicita miniaturas estaticas a `/api/image-preview`. Se usa
solo el primer fotograma, con un maximo de 96 x 96 px. El formato y la animacion
se detectan en el original, sin modificar los recursos ni el manifest.

En desarrollo o servidores Node con disco, los originales se leen de
`public/pages/`. En funciones serverless donde esa carpeta se excluye del bundle,
se pueden descargar desde el sitio estatico usando las variables de Netlify
(`URL` o `DEPLOY_PRIME_URL`), Vercel (`VERCEL_URL` o
`VERCEL_PROJECT_PRODUCTION_URL`) o Render (`RENDER_EXTERNAL_URL`). Para otro
hosting o un dominio de recursos separado, configurar:

```text
EDITOR_ASSET_ORIGIN=https://libro.ejemplo.com
```

Debe ser un origen HTTPS confiable que sirva los originales bajo `/pages/`, sin
subruta ni redirecciones. Nunca se usa el host enviado por el cliente para esta
descarga. Solo se aceptan recursos locales del libro bajo `/pages/`; una imagen
externa puede seguir usandose en el libro, pero no tendra miniatura en este panel.
Si falla una miniatura, se muestra un marcador sin impedir editar el elemento.

Las miniaturas se cargan al entrar en la zona visible. La cache del servidor y el
numero de generaciones simultaneas estan limitados; los originales remotos no se
guardan en disco.

En `/probar`, las miniaturas se generan con canvas en el navegador, sin llamar
a esta API ni enviar los archivos temporales al servidor.
