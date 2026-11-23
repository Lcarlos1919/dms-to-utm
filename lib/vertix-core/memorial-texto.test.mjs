// Memorial em texto corrido com a mesma estrutura dos memoriais de lote urbano:
// vértices com travessão (M – 02), coordenadas por vértice e o último trecho sem a unidade "m".
// O texto é sintético (sem dados de proprietário).
import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { lerMemorial } = require("../../.test-build/vertix-core/memorial.js")
const { corrigirDistancias } = require("../../.test-build/vertix-core/correcao.js")

const texto = `
Imóvel: LOTE 99 QUADRA 1 SETOR 001
Município: EXEMPLO U.F: RO - BR
Perímetro (m): 76,29 m
DESCRIÇÃO DO PERÍMETRO: Inicia-se a descrição deste lote, na Rua A, no vértice M - 08, de coordenadas de Lat: -11º40'49.604'' e Long: -62º42'36.185'' altitude 217,55m, segue confrontando com a Rua A com azimute de 104º50'24" por uma distância de 80,03 m de frente, até o vértice M – 02, de coordenada de Lat: -11º40'49.670'', Long: -62º42'35.928'' e altitude 217,49m, segue confrontando o Lote 26 com azimute de 195º09'40" por uma distância de 30,13m ao Lado direito, até o vértice M – 03, de coordenada de Lat: -11º40'50.617'', Long: -62º42'36.188'' e altitude de 217,55m, segue confrontando os Lotes 11 com azimute de 285º04'48" por uma distância de 8,03m ao fundo, até o vértice M - 09, de coordenada de Lat: -11º40'50.550'', Long: -62º42'36.444'' de altitude de 217,79m, segue confrontando o Lote 25 com azimute de 15º10'02" por uma distância de 30,10 ao Lado Esquerdo, até o vértice M – 08, onde teve início essa descrição.
`

test("lê todos os trechos com vértices separados por travessão e distância sem unidade", () => {
  const m = lerMemorial(texto)
  assert.equal(m.inicio, "M-08")
  assert.deepEqual(
    m.segmentos.map((s) => [s.de, s.para, s.distancia]),
    [
      ["M-08", "M-02", 80.03],
      ["M-02", "M-03", 30.13],
      ["M-03", "M-09", 8.03],
      ["M-09", "M-08", 30.1],
    ],
  )
  assert.equal(m.perimetroM, 76.29)
})

test("captura a coordenada de cada vértice, incluindo os com travessão", () => {
  const m = lerMemorial(texto)
  assert.deepEqual(Object.keys(m.coordenadas).sort(), ["M-02", "M-03", "M-08", "M-09"])
  assert.ok(Math.abs(m.coordenadas["M-08"].lat - -11.680445) < 1e-5)
})

// Cabeçalho impresso do INCRA/CEER e tabela "DADOS DO PERÍMETRO" (azimute e comprimento, sem coordenadas).
// Valores sintéticos, com a mesma forma dos memoriais de gleba.
const textoTabela = `
IMÓVEL: Gleba Exemplo SETOR: Setor Teste
GLEBA: 05 LOTE: 15 ÁREA: 77,3977 ha PER: 5.074,63 m
OBJETO: TP-00/00
DADOS DO PERÍMETRO
M - 44 / M - 13 121°30'47" 2.280,30 m Est. vic. Linha 0
M - 13 / M - 42 281°47'59" 2.013,75 m
M - 42 / M - 43 02°08'26" 500,65 m Est. vic. Linha 04
M - 43 / M - 44 01°44'24" 279,93 m
`

test("lê o cabeçalho impresso (ÁREA: / PER: / GLEBA: / LOTE:) e a tabela de azimutes do perímetro", () => {
  const m = lerMemorial(textoTabela)
  assert.equal(m.gleba, "05")
  assert.equal(m.lote, "15")
  assert.equal(m.areaHa, 77.3977)
  assert.equal(m.perimetroM, 5074.63)
  assert.deepEqual(
    m.segmentos.map((s) => [s.de, s.para, s.distancia]),
    [
      ["M-44", "M-13", 2280.3],
      ["M-13", "M-42", 2013.75],
      ["M-42", "M-43", 500.65],
      ["M-43", "M-44", 279.93],
    ],
  )
  const soma = m.segmentos.reduce((a, s) => a + s.distancia, 0)
  assert.ok(Math.abs(soma - m.perimetroM) < 0.01)
})

test("não corrige quando a distância não confirma o perímetro declarado", () => {
  const m = lerMemorial(texto)
  const segs = m.segmentos.map((s) => ({ ...s }))
  // Sem perímetro declarado, a correção não tem como confirmar o valor: só aponta.
  const r = corrigirDistancias(segs, m.coordenadas, undefined)
  assert.equal(r.correcoes.length, 0)
  assert.ok(r.suspeitas.length >= 1)
})
