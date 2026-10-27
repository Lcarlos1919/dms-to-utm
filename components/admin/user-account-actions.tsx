"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type PendingAction = "credits" | "usage" | "suspension" | null

export function UserAccountActions({
  userId,
  initialSuspended,
  initialBonusCredits,
  canManageUsers,
  canManageUsage,
}: {
  userId: string
  initialSuspended: boolean
  initialBonusCredits: number
  canManageUsers: boolean
  canManageUsage: boolean
}) {
  const router = useRouter()
  const [suspended, setSuspended] = useState(initialSuspended)
  const [bonusCredits, setBonusCredits] = useState(initialBonusCredits)
  const [amount, setAmount] = useState("1")
  const [pending, setPending] = useState<PendingAction>(null)
  const [message, setMessage] = useState("")

  async function addCredits() {
    const parsedAmount = Number(amount)
    if (!Number.isInteger(parsedAmount) || parsedAmount < 1 || parsedAmount > 1000) {
      setMessage("Informe um valor inteiro entre 1 e 1.000.")
      return
    }

    setPending("credits")
    setMessage("")
    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, amount: parsedAmount }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(result?.error ?? "Não foi possível adicionar créditos.")
        return
      }
      setBonusCredits(Number(result.bonusCredits ?? bonusCredits + parsedAmount))
      setAmount("1")
      setMessage("Créditos bônus adicionados.")
      router.refresh()
    } catch {
      setMessage("Não foi possível adicionar créditos.")
    } finally {
      setPending(null)
    }
  }

  async function runUserAction(action: "reset_usage" | "suspend" | "reactivate") {
    const confirmation = action === "reset_usage"
      ? "Zerar o uso de memoriais deste mês para este usuário?"
      : action === "suspend"
        ? "Suspender esta conta? O usuário perderá as sessões ativas e não poderá entrar até ser reativado."
        : "Reativar esta conta e permitir um novo acesso?"

    if (!window.confirm(confirmation)) return

    const pendingAction = action === "reset_usage" ? "usage" : "suspension"
    setPending(pendingAction)
    setMessage("")
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, userId }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setMessage(result?.error ?? "Não foi possível concluir a ação.")
        return
      }
      if (action !== "reset_usage") setSuspended(Boolean(result.suspended))
      setMessage(action === "reset_usage" ? "Uso do mês zerado." : result.suspended ? "Conta suspensa." : "Conta reativada.")
      router.refresh()
    } catch {
      setMessage("Não foi possível concluir a ação.")
    } finally {
      setPending(null)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5" aria-label="Ações da conta">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium text-zinc-100">Conta e uso</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Créditos bônus: <span className="text-zinc-200">{bonusCredits}</span>
            <span className="mx-2" aria-hidden="true">·</span>
            Estado: <span className="text-zinc-200">{suspended ? "Suspensa" : "Ativa"}</span>
          </p>
        </div>
        {canManageUsers && (
          <Button
            type="button"
            size="sm"
            variant={suspended ? "secondary" : "destructive"}
            disabled={pending !== null}
            onClick={() => void runUserAction(suspended ? "reactivate" : "suspend")}
          >
            {pending === "suspension" ? "Salvando…" : suspended ? "Reativar conta" : "Suspender conta"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {canManageUsers && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1 text-xs text-zinc-400">
              Créditos a adicionar
              <Input
                type="number"
                min={1}
                max={1000}
                step={1}
                inputMode="numeric"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={pending !== null}
                className="w-36"
                aria-label="Quantidade de créditos bônus"
              />
            </label>
            <Button type="button" size="sm" variant="outline" disabled={pending !== null} onClick={() => void addCredits()}>
              {pending === "credits" ? "Adicionando…" : "Adicionar créditos"}
            </Button>
          </div>
        )}
        {canManageUsage && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending !== null}
            onClick={() => void runUserAction("reset_usage")}
          >
            {pending === "usage" ? "Zerando…" : "Zerar uso do mês"}
          </Button>
        )}
      </div>
      <p className="min-h-5 text-sm text-zinc-400" role="status" aria-live="polite">{message}</p>
    </section>
  )
}
