import FlipBook from "@/components/FlipBook"
import { bookBasePath } from "@/lib/book-config"
import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-screen">
      <FlipBook manifest={`${bookBasePath}/manifest.json`} />
      <aside className="fixed left-4 top-4 z-40 rounded-lg border border-white/10 bg-[#15191f]/95 px-4 py-3 text-white shadow-lg" aria-label="Probar el editor">
        <p className="text-[10px] uppercase tracking-wider text-gray-400">Demo interactiva</p>
        <Link href="/probar" className="mt-2 inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-xs font-semibold hover:bg-blue-500">Editar una copia de la demo</Link>
        <p className="mt-2 text-[10px] text-gray-400">Prueba temporal en escritorio. Sin instalar.</p>
      </aside>
    </main>
  )
}
