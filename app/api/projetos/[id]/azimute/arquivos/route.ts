import { erroApi } from "@/lib/api/projetos"
import { carregarProjetoAzimute } from "@/lib/azimute/contexto"
import { montarArquivos, nomeArquivosAzimute } from "@/lib/azimute/arquivos"
import { azimuteDadosSchema } from "@/lib/azimute/tipos"
import { canUseFeature } from "@/lib/features"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

/**
 * GET ?formato=resumo|kml|dxf|xlsx
 * resumo: pendências e arquivos disponíveis (JSON). kml/dxf/xlsx: o arquivo, ou 409 com o motivo.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregarProjetoAzimute(params)
  if (!ctx.ok) return ctx.response

  const formato = new URL(request.url).searchParams.get("formato") ?? "resumo"
  if (!["resumo", "kml", "dxf", "xlsx"].includes(formato)) {
    return erroApi(400, "FORMATO_INVALIDO", "Use formato=resumo, kml, dxf ou xlsx.")
  }
  if (formato === "kml" && !(await canUseFeature(ctx.userId, "export_kml"))) {
    return erroApi(403, "RECURSO_INDISPONIVEL", "A exportação KML não está disponível para o seu plano.")
  }

  const dados = azimuteDadosSchema.safeParse(ctx.project.azimute_dados)
  if (!dados.success) return erroApi(422, "DADOS_INVALIDOS", "Os dados do memorial estão inválidos. Leia os documentos de novo.")

  const { data: projeto } = await createAdminClient().from("projects").select("name").eq("id", ctx.id).maybeSingle()
  const arquivos = montarArquivos(dados.data, projeto?.name ?? "vertix")
  const headers = { "Cache-Control": "no-store" }

  if (formato === "resumo") {
    return Response.json(
      {
        georreferenciado: arquivos.georreferenciado,
        pendencias: arquivos.pendencias,
        disponiveis: { kml: !!arquivos.kml, dxf: !!arquivos.dxf, xlsx: !!arquivos.xlsx },
      },
      { headers },
    )
  }

  const corpo = formato === "kml" ? arquivos.kml : formato === "dxf" ? arquivos.dxf : arquivos.xlsx
  if (!corpo) {
    const motivo = arquivos.pendencias.find((p) => p.startsWith("KML") || p.startsWith("Tabela")) ?? arquivos.pendencias[0] ?? "Arquivo indisponível."
    return erroApi(409, "ARQUIVO_INDISPONIVEL", motivo)
  }

  const tipo = {
    kml: "application/vnd.google-earth.kml+xml",
    dxf: "application/dxf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }[formato]
  return new Response(typeof corpo === "string" ? corpo : new Uint8Array(corpo), {
    headers: {
      "Content-Type": tipo,
      "Content-Disposition": `attachment; filename="${nomeArquivosAzimute(projeto?.name ?? "vertix", formato as "kml" | "dxf" | "xlsx")}"`,
      ...headers,
    },
  })
}
