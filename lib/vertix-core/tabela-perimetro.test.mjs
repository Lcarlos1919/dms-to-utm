// Memorial em tabela (LADOS / AZIMUTES / COMPRIMENTOS), lido do OCR real de um memorial digitalizado do CEER.
// Os números conferem entre si: soma dos lados = PER do cabeçalho e fechamento de poucos centímetros.
import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { lerMemorial } = require("../../.test-build/vertix-core/memorial.js")
const { lerTabelaPerimetro, numeroDistancia } = require("../../.test-build/vertix-core/tabela.js")

const ocr = `MINISTÉRIO DA AGRICULTURA INSTITUTO NACIONAL DE COLONIZAÇÃO E REFORMA AGRÁRIA
COORDENADORIA ESPECIAL DO ESTADO DE RONDÔNIA CEER PROJETO Fundiário Guajará-Mirim - MEMORIAL DESCRITIVO
ESTADO DE RONDÔNIA MUNICÍPIO: Costa Marques IMÓVEL: SETOR: Gleba Rio Branco São Miguel
GLEBA: LOTE: 07 ÁREA m 51,5297 ha. PER: 4.623,040 05 OBJETO: TP-08/83 MÉTODO EMPREGADO: - ESTADIMÉTRICO POLIGONOMÉTRICO
LIMITES E CONFRONTAÇÕES NORTE- Lote nº 40 da Gleba 11, separado pela L-25. ESTE- Lote nº 09 da Gleba 05. SUL- Lote nº 17 da Gleba 05. OESTE- Lote nº 05 de Gleba 05.
DADOS DO PERÍMETRO LADOS AZIMUTES COMPRIMENTOS OBSERVAÇÕES 0 M-1343 - M-1341 90 29'42" 250,16 L-25 180 º25 ' 13" M-1341 M-1376 2,062,35 270°51'27" M-1376 M-1377 249,76 L-27 - 00°24'33" M-1377 M-1343 2.060,77 CONFERE: VISTO: HO PLANTEL - AGRIMENSURA E AGRONOMIA LTDA. Goiânia-Go.`

const texto = ocr.replace(/\s+/g, " ")

test("lê os 4 lados da tabela de perímetro com azimutes e distâncias corretos", () => {
  const tab = lerTabelaPerimetro(texto)
  assert.equal(tab.ok, true, tab.motivo)
  assert.equal(tab.segmentos.length, 4)
  assert.deepEqual(tab.segmentos.map((s) => [s.de, s.para]), [["M-1343", "M-1341"], ["M-1341", "M-1376"], ["M-1376", "M-1377"], ["M-1377", "M-1343"]])
  assert.deepEqual(tab.segmentos.map((s) => s.distancia), [250.16, 2062.35, 249.76, 2060.77])
  const az = tab.segmentos.map((s) => s.azimute)
  assert.ok(Math.abs(az[0] - (90 + 29 / 60 + 42 / 3600)) < 1e-9)
  assert.ok(Math.abs(az[1] - (180 + 25 / 60 + 13 / 3600)) < 1e-9)
  assert.ok(Math.abs(az[2] - (270 + 51 / 60 + 27 / 3600)) < 1e-9)
  assert.ok(Math.abs(az[3] - (24 / 60 + 33 / 3600)) < 1e-9)
})

test("separador duplo de milhar do OCR (2,062,35) vira 2062.35", () => {
  assert.equal(numeroDistancia("2,062,35"), 2062.35)
  assert.equal(numeroDistancia("2.060,77"), 2060.77)
  assert.equal(numeroDistancia("250,16"), 250.16)
})

test("lerMemorial usa a tabela, lê PER e ÁREA sem rótulo e confere a poligonal", () => {
  const m = lerMemorial(texto)
  assert.equal(m.segmentos.length, 4)
  assert.equal(m.perimetroM, 4623.04)
  assert.ok(Math.abs(m.areaHa - 51.5297) < 1e-6)
  assert.equal(m.conferencia.valido, true, m.conferencia.problemas.join("; "))
  assert.ok(m.conferencia.erroFechamentoM < 0.5, `fechamento ${m.conferencia.erroFechamentoM}`)
  assert.ok(Math.abs(m.conferencia.areaCalcHa - 51.5297) < 0.2)
})

test("um dígito trocado num azimute faz a conferência falhar e avisa", () => {
  const errado = texto.replace("270°51'27\"", "260°51'27\"")
  const m = lerMemorial(errado)
  assert.equal(m.conferencia.valido, false)
  assert.ok(m.avisos.some((a) => a.includes("Conferência da tabela falhou")))
})
