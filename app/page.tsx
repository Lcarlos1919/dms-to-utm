import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

// A landing page fica em outro site (vert1x.vercel.app), que redireciona para cá.
// Aqui a raiz leva direto ao sistema: painel para quem está logado, login para os demais.
export default async function Home() {
  const { userId } = await auth()
  redirect(userId ? "/dashboard" : "/sign-in")
}
