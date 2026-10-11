import { auth, currentUser } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { loginAdmin } from "./actions"

export const dynamic = "force-dynamic"

export default async function AdminLoginPage() {
  const { userId } = await auth()
  if (!userId) redirect(`/sign-in?redirect_url=${encodeURIComponent("/admin/login")}`)
  const user = await currentUser()
  const email = user?.emailAddresses.find((item) => item.id === user.primaryEmailAddressId)?.emailAddress ?? ""
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6">
      <form action={loginAdmin} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500">TopoCAD · Admin</p>
        <h1 className="mt-3 text-2xl font-semibold text-zinc-100">Entrar no painel</h1>
        <label className="mt-6 block text-sm text-zinc-400">Conta
          <input value={email} readOnly className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-400" />
        </label>
        <label className="mt-4 block text-sm text-zinc-400">Senha do painel
          <input name="password" type="password" required minLength={1} autoComplete="current-password" className="mt-2 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-zinc-100" />
        </label>
        <button className="mt-6 w-full rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white">Entrar</button>
      </form>
    </main>
  )
}
