import { createAdminClient } from "@/lib/supabase/server"
import { erroApi, identidadeApi } from "@/lib/api/projetos"
import { getUsageStatus } from "@/lib/usage"
import { z } from "zod"

export const runtime = "nodejs"
const schema = z.object({ nome: z.string().trim().min(1).max(120) })

export async function GET() { const userId = await identidadeApi(); if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta."); const db = createAdminClient(); const { data, error } = await db.from("projects").select("id,name,status,area_m2,created_at,updated_at").eq("user_id", userId).order("created_at", { ascending: false }); if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível carregar os projetos."); return Response.json(data ?? []) }

export async function POST(request: Request) { const userId = await identidadeApi(); if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta."); const body = schema.safeParse(await request.json().catch(() => null)); if (!body.success) return erroApi(400, "ENTRADA_INVALIDA", "Informe um nome válido para o projeto."); const db = createAdminClient(); const { data: profile } = await db.from("profiles").select("plan,can_create_memorials").eq("user_id", userId).maybeSingle(); if (profile && profile.plan !== "pro" && !profile.can_create_memorials) return erroApi(403, "PLANO_SEM_PERMISSAO", "Seu plano não permite criar memoriais."); const usage = await getUsageStatus(userId); if (!usage.canCreate) return erroApi(403, "COTA_EXCEDIDA", "Você atingiu o limite de memoriais do plano grátis neste mês."); const id = crypto.randomUUID(); const path = `${userId}/${id}/arquivo.pdf`; const { data: upload, error: uploadError } = await db.storage.from("memoriais").createSignedUploadUrl(path); if (uploadError || !upload) return erroApi(500, "UPLOAD_INDISPONIVEL", "Não foi possível preparar o upload do PDF."); const { error } = await db.from("projects").insert({ id, user_id: userId, name: body.data.nome, status: "draft", source_pdf_path: path }); if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível criar o projeto."); return Response.json({ id, upload: { path, token: upload.token } }, { status: 201 }) }
