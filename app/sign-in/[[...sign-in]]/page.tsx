import type { Metadata } from "next"
import { SignIn } from "@clerk/nextjs"

export const metadata: Metadata = { title: "Entrar — TopoCAD" }

export default function SignInPage() {
  return (
    <main className="min-h-screen bg-zinc-950 flex items-center justify-center px-6 py-12">
      <SignIn routing="path" path="/sign-in" forceRedirectUrl="/dashboard" />
    </main>
  )
}
