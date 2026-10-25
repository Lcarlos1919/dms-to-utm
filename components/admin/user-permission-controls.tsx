"use client"

import { useState } from "react"

type User = { user_id: string; email: string | null; plan: string; role: string; can_create_memorials: boolean; can_delete_memorials: boolean }

export function UserPermissionControls({ user, canManage }: { user: User; canManage: boolean }) {
  const [value, setValue] = useState({ plan: user.plan, create: user.can_create_memorials, remove: user.can_delete_memorials })
  const [status, setStatus] = useState("")

  async function save(changes: Record<string, unknown>) {
    setStatus("Salvando…")
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.user_id, ...changes }),
    })
    setStatus(response.ok ? "Salvo" : "Falha ao salvar")
  }

  if (!canManage) return <span className="text-xs text-zinc-500">Somente leitura</span>

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={value.create} onChange={(event) => {
          const next = event.target.checked
          setValue({ ...value, create: next })
          void save({ canCreateMemorials: next })
        }} />
        criar
      </label>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={value.remove} onChange={(event) => {
          const next = event.target.checked
          setValue({ ...value, remove: next })
          void save({ canDeleteMemorials: next })
        }} />
        excluir
      </label>
      <select value={value.plan} onChange={(event) => {
        const next = event.target.value
        setValue({ ...value, plan: next })
        void save({ plan: next })
      }} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1" aria-label={`Plano de ${user.email ?? user.user_id}`}>
        <option value="free">Grátis</option>
        <option value="pro">Premium</option>
      </select>
      <span className="text-zinc-500" aria-live="polite">{status}</span>
    </div>
  )
}
