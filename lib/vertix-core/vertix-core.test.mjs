// Testes do motor do memorial por azimute (lib/vertix-core).
// Rode com: pnpm run test:azimute  (compila lib/vertix-core para .test-build e executa)
import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const dir = "../../.test-build/vertix-core/"
const { lerMemorial, lerCoordenadaInicial } = require(dir + "memorial.js")
const { montarPoligonal, posicionar, decidirAncora } = require(dir + "montagem.js")
const { buscarAncoras } = require(dir + "ancora.js")
const { calcularPoligonal } = require(dir + "poligonal.js")
const { validarSegmentos, relatorioPoligonal } = require(dir + "revisao.js")

const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} != ${b} (tol ${tol})`)

const CABECALHO = "Imóvel: LOTE 139 GLEBA 02A Município: Porto Velho U.F: RO Área (ha): 1,0000 Perímetro (m): 400,00 "

test("formato principal: 'com azimute ... por uma distância de ... até o vértice'", () => {
  const txt = CABECALHO + `Inicia-se a descrição deste perímetro no vértice P-01; deste, segue confrontando com JOÃO DA SILVA, com azimute de 90°00'00" por uma distância de 100,00 m, até o vértice P-02; deste, segue confrontando com ESTRADA, com azimute de 180°00'00" por uma distância de 100,00 m, até o vértice P-03; deste, segue confrontando com RIO, com azimute de 270°00'00" por uma distância de 100,00 m, até o vértice P-04; deste, segue confrontando com MARIA, com azimute de 0°00'00" por uma distância de 100,00 m, até o vértice P-01, onde teve início esta descrição.`
  const m = lerMemorial(txt)
  assert.equal(m.lote, "139")
  assert.equal(m.gleba, "02A")
  assert.equal(m.inicio, "P-01")
  assert.equal(m.segmentos.length, 4)
  assert.deepEqual(m.segmentos.map((s) => s.para), ["P-02", "P-03", "P-04", "P-01"])
  assert.equal(m.segmentos[0].confrontante, "JOÃO DA SILVA")
  assert.deepEqual(validarSegmentos(m.segmentos), [])
  const r = relatorioPoligonal(m.segmentos, { areaHa: m.areaHa, perimetroM: m.perimetroM })
  assert.equal(r.situacao, "ok")
  perto(r.areaHa, 1, 1e-9)
})

test("formato invertido: 'até o vértice X, com azimute ... e distância ...'", () => {
  const txt = `Inicia-se no marco M-1, de coordenadas N 8.876.543,21 m e E 512.345,67 m; deste segue até o marco M-2, com azimute de 90°00'00" e distância de 50,00 m; daí segue até o marco M-3, com azimute de 180°00'00" e distância de 20,00 m; daí segue até o marco M-4, com azimute de 270°00'00" e distância de 50,00 m; daí segue até o marco M-1, com azimute de 0°00'00" e distância de 20,00 m, ponto inicial.`
  const m = lerMemorial(txt)
  assert.equal(m.segmentos.length, 4)
  assert.deepEqual(m.segmentos.map((s) => `${s.de}>${s.para}`), ["M-1>M-2", "M-2>M-3", "M-3>M-4", "M-4>M-1"])
  perto(m.segmentos[1].distancia, 20)
  perto(calcularPoligonal(m.segmentos).areaM2, 1000, 1e-6)
})

test("tabela De/Para/Azimute/Distância", () => {
  const txt = `QUADRO DE MEDIDAS De Para Azimute Distância P1 P2 45°00'00" 141,42 P2 P3 135°00'00" 141,42 P3 P4 225°00'00" 141,42 P4 P1 315°00'00" 141,42`
  const m = lerMemorial(txt)
  assert.equal(m.segmentos.length, 4)
  assert.equal(m.segmentos[0].de, "P1")
  assert.equal(m.segmentos[3].para, "P1")
  perto(m.segmentos[2].azimute, 225)
})

test("rumos (N 45° E) viram azimutes", () => {
  const txt = `Inicia-se no vértice V1; segue com rumo N 45°00'00" E por uma distância de 10,00 m até o vértice V2; segue com rumo S 45°00'00" E por uma distância de 10,00 m até o vértice V3; segue com rumo S 45°00'00" W por uma distância de 10,00 m até o vértice V4; segue com rumo N 45°00'00" W por uma distância de 10,00 m até o vértice V1, onde teve início.`
  const m = lerMemorial(txt)
  assert.deepEqual(m.segmentos.map((s) => s.azimute), [45, 135, 225, 315])
})

test("coordenada inicial UTM, fuso declarado e datum", () => {
  const c = lerCoordenadaInicial(`Sistema de referência SIRGAS 2000, Fuso 20 S. Inicia-se no vértice P-01, de coordenadas N 8.876.543,21 m e E 512.345,67 m; deste segue...`, "P-01")
  assert.equal(c.vertice, "P-01")
  perto(c.este, 512345.67)
  perto(c.norte, 8876543.21)
  assert.equal(c.fuso, 20)
  assert.equal(c.hemisferio, "S")
  assert.equal(c.datum, "SIRGAS 2000")
})

test("coordenada inicial com E antes de N e ponto decimal", () => {
  const c = lerCoordenadaInicial(`Inicia-se no marco M-1 (E=512345.67; N=8876543.21), meridiano central 63° W.`)
  perto(c.este, 512345.67)
  perto(c.norte, 8876543.21)
  assert.equal(c.fuso, 20)
})

test("coordenada inicial geográfica", () => {
  const c = lerCoordenadaInicial(`Inicia-se no vértice P1, de latitude 10°12'13,40" S e longitude 62°40'12,30" W, datum SIRGAS 2000.`)
  perto(c.lat, -(10 + 12 / 60 + 13.4 / 3600), 1e-9)
  perto(c.lon, -(62 + 40 / 60 + 12.3 / 3600), 1e-9)
  assert.equal(c.este, undefined)
})

test("sem coordenada no texto", () => {
  assert.equal(lerCoordenadaInicial(`Inicia-se no vértice P1; segue com azimute de 90°00'00" por 10 m até P2.`), undefined)
})

const quadrado = (lado, erro = 0) => [
  { de: "A", para: "B", azimute: 90, azimuteTexto: "", tipo: "azimute", distancia: lado + erro },
  { de: "B", para: "C", azimute: 180, azimuteTexto: "", tipo: "azimute", distancia: lado },
  { de: "C", para: "D", azimute: 270, azimuteTexto: "", tipo: "azimute", distancia: lado },
  { de: "D", para: "A", azimute: 0, azimuteTexto: "", tipo: "azimute", distancia: lado },
]

test("Bowditch: distribui o erro de fechamento e fecha a poligonal", () => {
  const p = montarPoligonal(quadrado(100, 0.2))
  perto(p.fechamentoLinearM, 0.2, 1e-9)
  assert.equal(p.vertices.length, 4)
  assert.ok(p.compensada)
  // O último lado (D→A, 100 m para o norte) recebe a sua parte da correção e chega exatamente em A (0,0).
  const D = p.vertices[3]
  perto(D.y, -100, 1e-9)
  perto(D.x - (0.2 * 100) / 400.2, 0, 1e-9)
})

test("posicionar coloca o vértice escolhido na coordenada", () => {
  const p = montarPoligonal(quadrado(100))
  const v = posicionar(p, "C", 500100, 8799900)
  const a = v.find((q) => q.nome === "A")
  perto(a.x, 500000, 1e-6)
  perto(a.y, 8800000, 1e-6)
})

test("encaixe automático no lote da base quando é inequívoco", () => {
  const lote = [[500000, 8800000], [500100, 8800000], [500100, 8799900], [500000, 8799900]]
  const cands = buscarAncoras(calcularPoligonal(quadrado(100)), lote, { max: 20 })
  const d = decidirAncora(cands)
  assert.equal(d.automatica, true)
  const pos = posicionar(montarPoligonal(quadrado(100)), d.escolhida.verticeMemorial, d.escolhida.ponto[0], d.escolhida.ponto[1])
  const a = pos.find((q) => q.nome === "A")
  perto(a.x, 500000, 1e-6)
  perto(a.y, 8800000, 1e-6)
})

test("lote muito maior que o memorial: não decide sozinho", () => {
  const lote = [[500000, 8800000], [501000, 8800000], [501000, 8799000], [500000, 8799000]]
  const d = decidirAncora(buscarAncoras(calcularPoligonal(quadrado(100)), lote, { max: 20 }))
  assert.equal(d.automatica, false)
  assert.ok(d.distintas.length > 1)
})
