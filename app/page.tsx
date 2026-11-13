import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

// A landing page agora vive em um projeto separado.
// Aqui a raiz só encaminha: logado vai ao dashboard, deslogado vai ao login.
export default async function Home() {
  const { userId } = await auth()
  redirect(userId ? "/dashboard" : "/sign-in")
}
