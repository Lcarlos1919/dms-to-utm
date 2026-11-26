import { identidadeApi, erroApi } from "@/lib/api/projetos"
import { criarLinkCheckout } from "@/lib/assinatura"

export const runtime = "nodejs"

export async function POST() {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")
  try {
    const url = await criarLinkCheckout(userId)
    if (!url) return erroApi(503, "PAGAMENTO_INDISPONIVEL", "O pagamento não está disponível agora. Fale com o suporte.")
    return Response.json({ url })
  } catch {
    return erroApi(500, "ERRO_PAGAMENTO", "Não foi possível iniciar o pagamento. Tente novamente em instantes.")
  }
}
