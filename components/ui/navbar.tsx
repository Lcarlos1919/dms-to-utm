"use client"

import Link from "next/link"
const navLinks = [
  { href: "/#recursos", label: "Recursos" },
  { href: "/#como-funciona", label: "Como funciona" },
  { href: "/#precos", label: "Preços" },
]

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 p-4">
      <nav className="max-w-5xl mx-auto flex items-center justify-between h-12 px-6 rounded-full bg-zinc-900/70 border border-zinc-800/50 backdrop-blur-md">
        <Link href="/" className="font-display text-lg font-semibold text-zinc-100">
          TopoCAD
        </Link>
        <div className="flex items-center gap-1">
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-4 py-1.5 text-sm rounded-full transition-colors text-zinc-400 hover:text-zinc-100"
              >
                {link.label}
              </Link>
            ))}
          </div>
          <Link
            href="/sign-in"
            prefetch={false}
            className="px-4 py-1.5 text-sm rounded-full transition-colors text-zinc-400 hover:text-zinc-100"
          >
            Entrar
          </Link>
          <Link
            href="/sign-up"
            className="ml-2 px-4 py-1.5 text-sm rounded-full bg-zinc-100 text-zinc-900 font-medium hover:bg-zinc-200 transition-colors"
          >
            Começar grátis
          </Link>
        </div>
      </nav>
    </header>
  )
}
