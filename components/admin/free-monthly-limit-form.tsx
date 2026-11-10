"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { updateFreeMonthlyLimit } from "@/app/admin/configuracoes/actions"

export function FreeMonthlyLimitForm({ initialValue }: { initialValue: number }) {
  const router = useRouter()
  const [value, setValue] = useState(String(initialValue))
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState("")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setMessage("")

    try {
      const result = await updateFreeMonthlyLimit(new FormData(event.currentTarget))
      setMessage(result.message)
      router.refresh()
    } catch {
      setMessage("Não foi possível salvar o limite mensal.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div>
        <h2 className="text-lg font-medium text-zinc-100">Cota do plano grátis</h2>
        <p className="mt-1 text-sm text-zinc-500">Defina quantos memoriais prontos podem ser contabilizados por mês.</p>
      </div>
      <FieldGroup className="max-w-sm gap-3">
        <Field>
          <FieldLabel htmlFor="free-monthly-limit">Limite mensal</FieldLabel>
          <Input
            id="free-monthly-limit"
            name="limit"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            required
            disabled={pending}
          />
          <FieldDescription>Rascunhos e projetos com erro não consomem cota.</FieldDescription>
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Salvando…" : "Salvar configuração"}
        </Button>
        <span className="text-sm text-zinc-400" role="status" aria-live="polite">{message}</span>
      </div>
    </form>
  )
}
