import { createAdminClient } from "@/lib/supabase/server"
import { buildKml } from "@/lib/export/kml"
import { resolveKmlCrs } from "@/lib/export/kml-availability"
import { erroApi, identidadeApi, nomeArquivo } from "@/lib/api/projetos"
import { gerarDxf, gerarXlsx } from "@/lib/topocad"
import { crsDoProjeto, linhaParaVertice } from "@/lib/topocad-db/mapeamento"

export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const { id } = await params
  const formato = new URL(request.url).searchParams.get("formato")
  if (formato !== "xlsx" && formato !== "dxf" && formato !== "kml") {
    return erroApi(400, "FORMATO_INVALIDO", "Use formato=xlsx, formato=dxf ou formato=kml.")
  }

  const db = createAdminClient()
  const { data: projeto } = await db
    .from("projects")
    .select("id,user_id,name,status,datum,utm_zone,utm_hemisphere,epsg,area_m2,perimeter_m")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()

  if (!projeto) return erroApi(404, "NAO_ENCONTRADO", "Projeto não encontrado.")
  if (projeto.status !== "ready") {
    return erroApi(409, "PROJETO_NAO_PRONTO", "Processe o memorial antes de exportar.")
  }

  const { data: rows, error: verticesError } = await db
    .from("project_vertices")
    .select("project_id,seq,code,lon_dms,lat_dms,lon_dec,lat_dec,altitude_m,vante_code,azimuth_dms,distance_m,confrontacao,easting,northing,edited")
    .eq("project_id", id)
    .order("seq")
  const vertices = (rows ?? []).map(linhaParaVertice)

  if (formato === "kml") {
    if (verticesError) return erroApi(500, "ERRO_BANCO", "Não foi possível carregar os vértices do projeto.")
    const resolution = resolveKmlCrs(projeto.datum, projeto.utm_zone, projeto.utm_hemisphere)
    if (!resolution.ok) return erroApi(422, "KML_INDISPONIVEL", resolution.message)
    if (vertices.length < 3) {
      return erroApi(409, "VERTICES_INSUFICIENTES", "O projeto precisa de pelo menos três vértices para exportar KML.")
    }

    try {
      const kml = buildKml({
        vertices: vertices.map((vertex) => ({
          name: vertex.codigo,
          easting: vertex.este,
          northing: vertex.norte,
        })),
        datum: resolution.crs.datum,
        zone: resolution.crs.zone,
        hemisphere: resolution.crs.hemisphere,
        metadata: {
          propertyName: projeto.name,
          owner: "",
          municipality: "",
          areaHa: Number(projeto.area_m2 ?? 0) / 10000,
          perimeterM: Number(projeto.perimeter_m ?? 0),
        },
      })

      return new Response(kml, {
        headers: {
          "Content-Type": "application/vnd.google-earth.kml+xml",
          "Content-Disposition": `attachment; filename="${nomeArquivo(projeto.name, "kml")}"`,
        },
      })
    } catch (error) {
      return erroApi(
        422,
        "KML_INVALIDO",
        error instanceof Error ? error.message : "Não foi possível gerar o KML.",
      )
    }
  }

  const crs = crsDoProjeto(projeto as any)
  if (formato === "dxf") {
    return new Response(gerarDxf(vertices), {
      headers: {
        "Content-Type": "application/dxf",
        "Content-Disposition": `attachment; filename="${nomeArquivo(projeto.name, "dxf")}"`,
      },
    })
  }

  const bytes = gerarXlsx(vertices, crs, [
    ["Projeto", projeto.name],
    ["Área (m²)", Number(projeto.area_m2 ?? 0)],
    ["Perímetro (m)", Number(projeto.perimeter_m ?? 0)],
  ])
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nomeArquivo(projeto.name, "xlsx")}"`,
    },
  })
}
