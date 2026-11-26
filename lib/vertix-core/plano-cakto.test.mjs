// Regras do plano Grátis/Pro e validação da assinatura dos webhooks da Cakto.
import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { createHmac } from "node:crypto"

const require = createRequire(import.meta.url)
const plano = require("../../.test-build/vertix-core/plano.js")
const cakto = require("../../.test-build/vertix-core/cakto.js")

const agora = new Date("2026-11-25T12:00:00Z")
const DIA = 24 * 60 * 60 * 1000

test("grátis: 3 memoriais no total, 1 azimute, 2 OCR, 3 comuns", () => {
  const s = plano.calcularSituacao({ plan: "free" }, ["azimute"], agora)
  assert.equal(s.plano, "gratis")
  assert.equal(s.totalUsado, 1)
  assert.equal(s.totalLimite, 3)
  assert.equal(s.podeCriar, true)
  assert.equal(plano.motivoBloqueio(s, "azimute", false) !== null, true, "azimute já usado")
  assert.equal(plano.motivoBloqueio(s, "ocr", false), null)
  assert.equal(plano.motivoBloqueio(s, "comum", false), null)
})

test("grátis: esgotado o total de 3, bloqueia qualquer categoria", () => {
  const s = plano.calcularSituacao({ plan: "free" }, ["comum", "ocr", "ocr"], agora)
  assert.equal(s.podeCriar, false)
  assert.match(plano.motivoBloqueio(s, "comum", false), /Assine o Pro/)
})

test("grátis: reprocessar um projeto já contado não cobra de novo", () => {
  const s = plano.calcularSituacao({ plan: "free" }, ["azimute", "ocr", "ocr"], agora)
  assert.equal(plano.motivoBloqueio(s, "azimute", true), null)
})

test("bônus de créditos aumenta o total grátis", () => {
  const s = plano.calcularSituacao({ plan: "free", bonus_credits: 2 }, ["comum", "comum", "comum"], agora)
  assert.equal(s.totalLimite, 5)
  assert.equal(s.podeCriar, true)
})

test("pro ativo: ilimitado e com dias restantes", () => {
  const expira = new Date(agora.getTime() + 10 * DIA).toISOString()
  const s = plano.calcularSituacao({ plan: "pro", plan_expires_at: expira }, ["azimute", "ocr", "ocr", "comum", "comum", "comum"], agora)
  assert.equal(s.plano, "pro")
  assert.equal(s.totalLimite, null)
  assert.equal(s.diasRestantes, 10)
  assert.equal(s.podeCriar, true)
  assert.equal(plano.motivoBloqueio(s, "azimute", false), null)
})

test("pro expirado volta para grátis, com o uso já contado", () => {
  const expira = new Date(agora.getTime() - DIA).toISOString()
  const s = plano.calcularSituacao({ plan: "pro", plan_expires_at: expira }, ["comum", "comum", "comum"], agora)
  assert.equal(s.plano, "gratis")
  assert.equal(s.podeCriar, false)
})

test("30 dias: compra soma a partir de agora; renovação antes do fim soma ao fim atual", () => {
  const novo = plano.fimDoProApos(null, agora)
  assert.equal(novo.getTime() - agora.getTime(), 30 * DIA)
  const ainda = new Date(agora.getTime() + 5 * DIA).toISOString()
  assert.equal(plano.fimDoProApos(ainda, agora).getTime() - agora.getTime(), 35 * DIA)
})

const segredo = "segredo-de-teste"
const corpo = JSON.stringify({ secret: "x", event: "purchase_approved", data: { id: "abc" } })
const assina = (ts, c = corpo) => `v1=${createHmac("sha256", segredo).update(`${ts}.`).update(c).digest("hex")}`
const ts = String(Math.floor(agora.getTime() / 1000))

test("assinatura da Cakto: aceita a assinatura correta dentro da janela", () => {
  assert.equal(cakto.verificarAssinaturaCakto({ corpo, timestamp: ts, assinatura: assina(ts), segredo, agora: agora.getTime() }), true)
})

test("assinatura da Cakto: rejeita corpo alterado, segredo errado, falta de header e entrega antiga", () => {
  const base = { segredo, agora: agora.getTime() }
  assert.equal(cakto.verificarAssinaturaCakto({ ...base, corpo: corpo + " ", timestamp: ts, assinatura: assina(ts) }), false)
  assert.equal(cakto.verificarAssinaturaCakto({ ...base, corpo, timestamp: ts, assinatura: assina(ts).replace(/.$/, "0") }), false)
  assert.equal(cakto.verificarAssinaturaCakto({ ...base, corpo, timestamp: null, assinatura: assina(ts) }), false)
  assert.equal(cakto.verificarAssinaturaCakto({ ...base, corpo, timestamp: ts, assinatura: null }), false)
  const antiga = String(Math.floor(agora.getTime() / 1000) - 3600)
  assert.equal(cakto.verificarAssinaturaCakto({ ...base, corpo, timestamp: antiga, assinatura: assina(antiga) }), false)
})

test("assinatura da Cakto: aceita quando uma das versões separadas por vírgula bate", () => {
  const combinada = `v2=0000,${assina(ts)}`
  assert.equal(cakto.verificarAssinaturaCakto({ corpo, timestamp: ts, assinatura: combinada, segredo, agora: agora.getTime() }), true)
})

const mensagens = require("../../.test-build/vertix-core/mensagens.js")
test("erros para o usuário: sem código técnico nem detalhe interno", () => {
  assert.equal(mensagens.mensagemParaUsuario("NENHUM_VERTICE").includes("NENHUM_VERTICE"), false)
  assert.match(mensagens.mensagemParaUsuario("LIMITE_PLANO"), /Assine o Pro/)
  assert.match(mensagens.mensagemParaUsuario("CODIGO_QUE_NAO_EXISTE"), /suporte/)
  assert.match(mensagens.mensagemParaUsuario(null), /suporte/)
})
