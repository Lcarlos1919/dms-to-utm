import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { gerarDxf } from "@/lib/topocad"
import type { Vertice } from "@/lib/topocad/tipos"

export async function GET(request: Request, { params }: { params: Promise<{ id: string; format: string }> }) {
  const userId = await requireUser()
  const { id, format } = await params
  if (!/^(pdf|dxf)$/.test(format)) return NextResponse.json({ error: "Formato inválido." }, { status: 400 })
  const db = createAdminClient()
  const { data: project } = await db.from("projects").select("id, name, source_pdf_path").eq("id", id).eq("user_id", userId).maybeSingle()
  if (!project) return NextResponse.json({ error: "Projeto não encontrado." }, { status: 404 })

  if (format === "pdf") {
    if (!project.source_pdf_path) return NextResponse.json({ error: "Memorial PDF não disponível." }, { status: 404 })
    const { data, error } = await db.storage.from("memoriais").download(project.source_pdf_path)
    if (error || !data) return NextResponse.json({ error: "Não foi possível baixar o memorial." }, { status: 404 })
    return new NextResponse(data, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9-_]+/gi, "-")}.pdf"` } })
  }

  const { data: vertices, error } = await db.from("project_vertices").select("easting, northing, code").eq("project_id", id).order("seq")
  if (error) return NextResponse.json({ error: "Não foi possível carregar os vértices." }, { status: 500 })
  if (!vertices?.length) return NextResponse.json({ error: "Processe o memorial antes de exportar o DXF." }, { status: 409 })
  const body = gerarDxf(vertices.map((vertex) => ({
    codigo: vertex.code,
    este: vertex.easting,
    norte: vertex.northing,
  })) as Pick<Vertice, "codigo" | "este" | "norte">[])
  return new NextResponse(body, { headers: { "Content-Type": "application/dxf", "Content-Disposition": `attachment; filename="${project.name.replace(/[^a-z0-9-_]+/gi, "-")}.dxf"` } })
}
