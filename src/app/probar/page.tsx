import type { Metadata } from "next"
import BookEditor from "@/components/BookEditor"
import { bookConfig } from "@/lib/book-config"

export const metadata: Metadata = {
  title: `Probar el editor | ${bookConfig.title}`,
  description: "Edita una copia temporal de la demo en tu navegador, sin modificar el libro publicado.",
}

export default function TrialPage() {
  return <BookEditor sandbox />
}
