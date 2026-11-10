import { Check } from "lucide-react"
import Link from "next/link"
import BorderGlow from "@/components/BorderGlow"
import { cn } from "@/lib/utils"

type Plan = {
  name: string
  description: string
  price: string
  period: string
  features: string[]
  cta: string
  href: string | null
  highlighted: boolean
}

const plans: Plan[] = [
  {
    name: "Grátis",
    description: "Para conhecer a ferramenta e projetos ocasionais",
    price: "R$ 0",
    period: "/mês",
    features: ["3 memoriais por mês", "Exportação XLSX e DXF", "Histórico de projetos"],
    cta: "Começar grátis",
    href: "/sign-up",
    highlighted: false,
  },
  {
    name: "Pro",
    description: "Para quem processa memoriais todos os dias",
    price: "Em breve",
    period: "",
    features: ["Memoriais ilimitados", "Suporte prioritário", "Histórico completo"],
    cta: "Disponível em breve",
    href: null,
    highlighted: true,
  },
]

export function PricingSection({
  headingLevel = "h2",
  compact = false,
  currentPlan,
}: {
  headingLevel?: "h1" | "h2"
  compact?: boolean
  currentPlan?: "free" | "pro"
}) {
  const Heading = headingLevel

  return (
    <section id="precos" className={cn(compact ? "w-full" : "scroll-mt-20 px-6 py-24")}>
      <div className={cn("mx-auto", compact ? "max-w-5xl" : "max-w-3xl")}>
        {!compact && (
          <header className="mb-16 text-center">
            <p className="mb-4 text-sm font-medium uppercase tracking-wider text-zinc-500">Preços</p>
            <Heading className="mb-4 font-display text-4xl font-bold text-zinc-100 md:text-5xl">
              Preços simples e transparentes
            </Heading>
            <p className="mx-auto max-w-xl text-balance text-lg text-zinc-500">
              Sem taxas escondidas. Comece grátis e assine quando precisar de mais.
            </p>
          </header>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {plans.map((plan) => {
            const isCurrentPlan = currentPlan === (plan.highlighted ? "pro" : "free")
            const price = plan.highlighted && isCurrentPlan ? "Ativo" : plan.price
            const buttonClassName = cn(
              "mt-auto block w-full rounded-full px-6 py-3 text-center text-sm font-medium transition-colors",
              plan.highlighted
                ? "bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
                : "bg-zinc-800 text-zinc-100 hover:bg-zinc-700",
            )

            return (
              <BorderGlow
                key={plan.name}
                className="h-full"
                backgroundColor={plan.highlighted ? "#f4f4f5" : "#18181b"}
                borderRadius={24}
                glowRadius={36}
                glowIntensity={1.15}
                colors={plan.highlighted ? ["#f59e0b", "#fb7185", "#a78bfa"] : ["#38bdf8", "#818cf8", "#c084fc"]}
              >
                <div className="flex h-full flex-col p-6 sm:p-8">
                  <div className="mb-6">
                    <h3 className={cn("mb-2 font-heading text-xl font-semibold", plan.highlighted ? "text-zinc-900" : "text-zinc-100")}>
                      {plan.name}
                    </h3>
                    {compact && isCurrentPlan && (
                      <p className={cn("mb-2 text-xs font-medium", plan.highlighted ? "text-zinc-700" : "text-zinc-300")}>
                        Plano atual
                      </p>
                    )}
                    <p className={cn("text-sm", plan.highlighted ? "text-zinc-600" : "text-zinc-500")}>
                      {plan.description}
                    </p>
                  </div>

                  <div className="mb-6">
                    <span className={cn("font-display text-4xl font-bold", plan.highlighted ? "text-zinc-900" : "text-zinc-100")}>
                      {price}
                    </span>
                    {plan.period && (
                      <span className={cn("text-sm", plan.highlighted ? "text-zinc-600" : "text-zinc-500")}>
                        {plan.period}
                      </span>
                    )}
                  </div>

                  <ul className="mb-8 flex flex-1 flex-col gap-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <Check
                          className={cn("h-5 w-5 shrink-0", plan.highlighted ? "text-zinc-900" : "text-zinc-400")}
                          aria-hidden="true"
                        />
                        <span className={cn("text-sm", plan.highlighted ? "text-zinc-700" : "text-zinc-400")}>
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {plan.href && !(compact && isCurrentPlan) ? (
                    <Link href={compact ? "/dashboard" : plan.href} className={buttonClassName}>
                      {compact ? "Ver projetos" : plan.cta}
                    </Link>
                  ) : (
                    <span aria-disabled="true" className={cn(buttonClassName, "cursor-default") }>
                      {compact && isCurrentPlan ? "Plano atual" : plan.cta}
                    </span>
                  )}
                </div>
              </BorderGlow>
            )
          })}
        </div>
      </div>
    </section>
  )
}
