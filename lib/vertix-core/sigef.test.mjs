// Filtro SIGEF sobre o lote do SIGLO. Polígonos sintéticos (lon/lat), sem dados reais.
import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { classificarPeloSigef, ordenarPeloSigef, urlSigefCaixa, pontoNoAnel, SIGEF_CAMADA } = require("../../.test-build/vertix-core/sigef.js")

const quadrado = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]
const lote = quadrado(0, 0, 1)

test("parcela idêntica ao lote é classificada como coincidente", () => {
  const r = classificarPeloSigef([lote], [{ aneis: [quadrado(0, 0, 1)] }])
  assert.equal(r.situacao, "coincide")
  assert.ok(r.fracaoLote > 0.95 && r.fracaoParcela > 0.95)
})

test("parcela que corta metade do lote é conflito", () => {
  const r = classificarPeloSigef([lote], [{ aneis: [quadrado(0.5, 0, 1)] }])
  assert.equal(r.situacao, "conflito")
  assert.ok(Math.abs(r.fracaoLote - 0.5) < 0.05)
})

test("parcela distante não interfere", () => {
  const r = classificarPeloSigef([lote], [{ aneis: [quadrado(5, 5, 1)] }])
  assert.equal(r.situacao, "sem_sobreposicao")
})

test("polígono não convexo (L) é tratado pela grade, não pela caixa envolvente", () => {
  const forma = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2], [0, 0]]
  // o ponto (1.5, 1.5) está fora do L, mas dentro da caixa 0..2
  assert.equal(pontoNoAnel([1.5, 1.5], forma), false)
  assert.equal(pontoNoAnel([0.5, 1.5], forma), true)
  const r = classificarPeloSigef([forma], [{ aneis: [quadrado(1.5, 0.5, 0.5)] }])
  // a parcela (1,5..2)x(0,5..1)... fica no braço do L: deve coincidir apenas em parte
  assert.notEqual(r.situacao, "coincide")
})

test("ordenação do coador: coincidente vem antes e conflito fica por último", () => {
  const cands = [
    { nome: "conflito", aneis: [quadrado(0, 0, 1)] },
    { nome: "coincide", aneis: [quadrado(3, 0, 1)] },
    { nome: "sem", aneis: [quadrado(9, 9, 1)] },
  ]
  const parcelas = [
    { aneis: [quadrado(0.5, 0, 1)] },
    { aneis: [quadrado(3, 0, 1)] },
  ]
  const { ordem, avisos } = ordenarPeloSigef(cands, parcelas)
  assert.deepEqual(ordem.map((c) => c.nome), ["coincide", "sem", "conflito"])
  assert.equal(avisos.length, 1)
})

test("consulta usa a camada do SIGEF privado de RO, sem campos de proprietário", () => {
  const url = urlSigefCaixa([lote])
  assert.ok(url.includes(encodeURIComponent(SIGEF_CAMADA)) || url.includes(SIGEF_CAMADA))
  assert.ok(!/proprietar|cpf|cnpj|nome_prop/i.test(url))
  assert.ok(url.includes("BBOX"))
})
