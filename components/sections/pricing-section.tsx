import { Check } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
            const ativo = Boolean(plan.href) && !(compact && isCurrentPlan)
            const label = ativo ? (compact ? "Ver projetos" : plan.cta) : compact && isCurrentPlan ? "Plano atual" : plan.cta

            return (
              <Card key={plan.name} className={cn("h-full", plan.highlighted && "border-foreground/30")}>
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                    {compact && isCurrentPlan && <Badge variant="secondary">Plano atual</Badge>}
                    {plan.highlighted && !isCurrentPlan && <Badge variant="outline">Recomendado</Badge>}
                  </div>
                  <CardDescription>{plan.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-6">
                  <p>
                    <span className="text-3xl font-semibold tracking-tight">{price}</span>
                    {plan.period && <span className="text-sm text-muted-foreground">{plan.period}</span>}
                  </p>
                  <ul className="flex flex-col gap-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <Check className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter>
                  {ativo ? (
                    <Button asChild className="w-full" variant={plan.highlighted ? "default" : "secondary"}>
                      <Link href={compact ? "/dashboard" : plan.href!}>{label}</Link>
                    </Button>
                  ) : (
                    <Button className="w-full" variant="secondary" disabled>
                      {label}
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
