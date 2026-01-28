import PdfBook from "@/components/PdfBook"

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <PdfBook url="/LibroVirtualDemo2.pdf" />
    </main>
  )
}
