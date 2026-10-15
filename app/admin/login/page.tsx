import type { Metadata } from "next"
import { SignIn } from "@clerk/nextjs"

export const metadata: Metadata = { title: "Entrar no painel — TopoCAD" }

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-12">
      <SignIn routing="path" path="/admin/login" forceRedirectUrl="/admin" />
    </main>
  )
}
