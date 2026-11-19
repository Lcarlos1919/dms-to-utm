import type { ReactNode } from "react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type DashboardCardProps = {
  children: ReactNode
  className?: string
}

/**
 * Card padrão do painel: o `Card` do shadcn/ui, sem espaçamento interno
 * (cada tela define o seu). Substitui o antigo BorderGlow com brilho em degradê.
 */
export function DashboardCard({ children, className }: DashboardCardProps) {
  return <Card className={cn("w-full gap-0 overflow-hidden py-0", className)}>{children}</Card>
}
