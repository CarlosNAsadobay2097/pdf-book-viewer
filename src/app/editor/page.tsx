import { redirect } from "next/navigation"
import BookEditor from "@/components/BookEditor"

export default function EditorPage() {
  if (process.env.NODE_ENV === "production") redirect("/probar")
  return <BookEditor />
}
