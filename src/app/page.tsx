import FlipBook from "@/components/FlipBook"

export default function Home() {
  return (
    <main className="min-h-screen">
      <FlipBook manifest="/pages/librovirtualdemo2/manifest.json" />
    </main>
  )
}