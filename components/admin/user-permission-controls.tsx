"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

type User = {
  user_id: string
  email: string | null
  plan: string
  role: string
  can_create_memorials: boolean
  can_delete_memorials: boolean
}

export function UserPermissionControls({
  user,
  canManageUsers,
  canManagePlan,
}: {
  user: User
  canManageUsers: boolean
  canManagePlan: boolean
}) {
  const router = useRouter()
  const [value, setValue] = useState({
    plan: user.plan === "pro" ? "pro" : "free",
    create: user.can_create_memorials,
    remove: user.can_delete_memorials,
  })
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState("")

  async function save(changes: Record<string, unknown>) {
    if (pending) return
    setPending(true)
    setStatus("Salvando…")

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: user.user_id, ...changes }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok) {
        setStatus(result?.error ?? "Não foi possível salvar a alteração.")
        return false
      }
      setStatus("Alteração salva.")
      router.refresh()
      return true
    } catch {
      setStatus("Não foi possível salvar a alteração.")
      return false
    } finally {
      setPending(false)
    }
  }

  async function updatePermission(field: "create" | "remove", next: boolean) {
    const previous = value[field]
    setValue((current) => ({ ...current, [field]: next }))
    const saved = await save(field === "create" ? { canCreateMemorials: next } : { canDeleteMemorials: next })
    if (!saved) setValue((current) => ({ ...current, [field]: previous }))
  }

  async function updatePlan(next: string) {
    const previous = value.plan
    setValue((current) => ({ ...current, plan: next }))
    const saved = await save({ plan: next })
    if (!saved) setValue((current) => ({ ...current, plan: previous }))
  }

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      {canManageUsers ? (
        <>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={value.create}
              disabled={pending}
              onChange={(event) => void updatePermission("create", event.target.checked)}
            />
            criar
          </label>
          <label className="flex items-center gap-2 text-zinc-300">
            <input
              type="checkbox"
              checked={value.remove}
              disabled={pending}
              onChange={(event) => void updatePermission("remove", event.target.checked)}
            />
            excluir
          </label>
        </>
      ) : (
        <span className="text-zinc-400">Criação: {value.create ? "permitida" : "bloqueada"} · Exclusão: {value.remove ? "permitida" : "bloqueada"}</span>
      )}
      {canManagePlan ? (
        <select
          value={value.plan}
          disabled={pending}
          onChange={(event) => void updatePlan(event.target.value)}
          className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100 disabled:opacity-50"
          aria-label={`Plano de ${user.email ?? user.user_id}`}
        >
          <option value="free">Grátis</option>
          <option value="pro">Pro</option>
        </select>
      ) : (
        <span className="text-zinc-400">Plano: {value.plan === "pro" ? "Pro" : "Grátis"}</span>
      )}
      <span className="text-zinc-500" aria-live="polite">{status}</span>
    </div>
  )
}
