import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { UsageStatus } from "@/lib/usage"

export function UsageCard({ usage }: { usage: UsageStatus }) {
  const isPro = usage.plan === "pro"
  const percent = usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0

  return (
    <Card className="w-full max-w-sm gap-4 py-5" aria-labelledby="usage-title">
      <CardHeader className="px-5">
        <CardDescription id="usage-title">Uso do mês</CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {usage.used}
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            {isPro ? "memoriais · ilimitado" : `de ${usage.limit} memoriais`}
          </span>
        </CardTitle>
        <CardAction>
          <Badge variant={isPro ? "default" : "secondary"}>{isPro ? "Pro" : "Grátis"}</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 px-5">
        {!usage.canCreateMemorials ? (
          <p role="status" className="text-sm text-muted-foreground">
            A criação de memoriais está bloqueada para esta conta. Contate o suporte para solicitar a liberação.
          </p>
        ) : (
          !isPro && (
            <>
              <Progress value={percent} aria-label="Memoriais usados" />
              {!usage.canCreate && (
                <p className="text-sm text-muted-foreground">
                  Limite atingido.{" "}
                  <Link href="/dashboard/planos" className="font-medium text-foreground underline underline-offset-4">
                    Ver planos
                  </Link>
                </p>
              )}
            </>
          )
        )}
      </CardContent>
    </Card>
  )
}
