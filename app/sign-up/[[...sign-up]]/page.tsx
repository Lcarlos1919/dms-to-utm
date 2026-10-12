import type { Metadata } from "next"
import Link from "next/link"
import { SignUp } from "@clerk/nextjs"

export const metadata: Metadata = { title: "Criar conta — TopoCAD" }

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-6 px-6 py-12">
      <Link href="/" className="font-display text-2xl font-semibold text-zinc-100">TopoCAD</Link>
      <SignUp routing="path" path="/sign-up" fallbackRedirectUrl="/dashboard" />
    </main>
  )
}
