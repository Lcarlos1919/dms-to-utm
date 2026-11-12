"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { FEATURE_KEYS, FEATURE_LABELS, type FeatureAccess } from "@/lib/feature-access"
import { updateFeatureAccess } from "@/app/admin/configuracoes/actions"

export function FeatureAccessForm({ initialValue }: { initialValue: FeatureAccess }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage("")
    try {
      const result = await updateFeatureAccess(new FormData(event.currentTarget))
      setMessage(result.message)
      router.refresh()
    } catch {
      setMessage("Não foi possível salvar as ferramentas por plano.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">Ferramentas por plano</h2>
        <p className="mt-1 text-sm text-zinc-500">Defina quais ferramentas cada plano pode usar. A mudança vale na hora.</p>
      </div>
      <div className="flex flex-col divide-y divide-zinc-800">
        {FEATURE_KEYS.map((key) => (
          <div key={key} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100">{FEATURE_LABELS[key].label}</p>
              <p className="text-xs text-zinc-500">{FEATURE_LABELS[key].description}</p>
            </div>
            <div className="flex items-center gap-4 text-sm text-zinc-300">
              {(["free", "pro"] as const).map((plan) => (
                <label key={plan} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name={`${key}.${plan}`}
                    defaultChecked={initialValue[key][plan]}
                    disabled={pending}
                    className="size-4 accent-emerald-500"
                  />
                  {plan === "free" ? "Grátis" : "Pro"}
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Salvando…" : "Salvar ferramentas"}
        </Button>
        <span className="text-sm text-zinc-400" role="status" aria-live="polite">{message}</span>
      </div>
    </form>
  )
}
