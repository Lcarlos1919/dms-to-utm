import { auth } from "@clerk/nextjs/server"
export async function identidadeApi() { const { userId } = await auth(); return userId }
export function erroApi(status: number, codigo: string, mensagem: string) { return Response.json({ erro: { codigo, mensagem } }, { status }) }
export function nomeArquivo(nome: string, ext: string) { const base = nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "vertix"; return `${base}.${ext}` }
