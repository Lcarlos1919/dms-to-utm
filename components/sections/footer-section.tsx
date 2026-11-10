import Link from "next/link"

const productLinks = [
  { label: "Recursos", href: "/#recursos" },
  { label: "Como funciona", href: "/#como-funciona" },
  { label: "Preços", href: "/#precos" },
  { label: "Planos", href: "/#precos" },
]

const legalLinks = [
  { label: "Termos", href: "#" },
  { label: "Privacidade", href: "#" },
]

export function FooterSection() {
  return (
    <footer className="px-6 py-16 border-t border-zinc-900">
      <div className="max-w-5xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2">
            <Link href="/" className="font-display text-xl font-semibold text-zinc-100">
              Vertix
            </Link>
            <p className="mt-4 text-sm text-zinc-500 max-w-xs">
              Do memorial descritivo em PDF ao DXF pronto no CAD, sem retrabalho manual.
            </p>
          </div>

          <div>
            <h4 className="font-heading text-sm font-semibold text-zinc-100 mb-4">Produto</h4>
            <ul className="space-y-3">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-heading text-sm font-semibold text-zinc-100 mb-4">Legal</h4>
            <ul className="space-y-3">
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-zinc-900 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-zinc-600">© 2026 Vertix. Todos os direitos reservados.</p>
          <div className="flex items-center gap-4 text-sm">
            {legalLinks.map((link) => (
              <Link key={link.label} href={link.href} className="text-zinc-500 hover:text-zinc-300 transition-colors">
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
