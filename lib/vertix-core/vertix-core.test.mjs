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

// ---------- PDFs escaneados (memoriais INCRA 1983, Gleba Rio Branco, Costa Marques/RO) ----------
// Transcrição no formato que a leitura por visão devolve (lib/azimute/ler-imagem.ts).
const { memorialDaTranscricao, anguloTranscrito, numeroTranscrito, textoDaCoordenada } = require(dir + "transcricao.js")

const lado = (de, para, angulo, distancia, confrontante = null) => ({ de, para, angulo, distancia, confrontante })
const transcricao = (cab, lados) => ({ imovel: "Gleba Rio Branco", nomeGleba: "Rio Branco", municipio: "Costa Marques", uf: null, coordenadaInicial: null, ...cab, lados })

const LOTE_07 = transcricao({ lote: "07", gleba: "05", areaHa: "51,5297", perimetroM: "4.623,040" }, [
  lado("M-1343", "M-1341", `90°29'42"`, "250,16", "L-25"),
  lado("M-1341", "M-1376", `180°25'13"`, "2.062,35"),
  lado("M-1376", "M-1377", `270°51'27"`, "249,76", "L-27"),
  lado("M-1377", "M-1343", `00°24'33"`, "2.060,77"),
])

const LOTE_56 = transcricao({ lote: "56", gleba: "14", areaHa: "209,3554", perimetroM: "6.953,942" }, [
  lado("M-2212", "M-2211", `179°54'50"`, "304,77", "L-76"),
  lado("M-2211", "M-2210", `179°54'51"`, "249,96"),
  lado("M-2210", "M-2209", `179°54'57"`, "250,26"),
  lado("M-2209", "M-2208", `179°55'02"`, "250,45"),
  lado("M-2208", "M-2207", `179°55'03"`, "250,43"),
  lado("M-2207", "M-2206", `179°55'11"`, "250,36"),
  lado("M-2206", "M-2205", `179°55'22"`, "250,34"),
  lado("M-2205", "M-2204", `179°55'28"`, "250,32"),
  lado("M-2204", "M-66", `265°50'17"`, "1.757,46"),
  lado("M-66", "D-225", `20°51'38"`, "236,63", "Igarapé Norte-Sul"),
  lado("D-225", "D-224", `04°11'52"`, "231,73"),
  lado("D-224", "D-223", `20°52'17"`, "300,08"),
  lado("D-223", "D-222", `53°00'26"`, "203,22"),
  lado("D-222", "D-221", `34°04'35"`, "236,98"),
  lado("D-221", "D-220", `50°23'20"`, "140,75"),
  lado("D-220", "D-219", `81°52'34"`, "178,99"),
  lado("D-219", "D-218", `38°22'38"`, "203,23"),
  lado("D-218", "D-217", `44°53'43"`, "108,96"),
  lado("D-217", "D-216", `119°43'50"`, "94,77"),
  lado("D-216", "D-215", `48°23'11"`, "113,91"),
  lado("D-215", "D-214", `343°06'23"`, "96,79"),
  lado("D-214", "D-213", `32°34'35"`, "113,23"),
  lado("D-213", "D-212", `86°49'54"`, "97,55"),
  lado("D-212", "D-211", `98°51'58"`, "41,66"),
  lado("D-211", "D-210", `69°40'41"`, "143,34"),
  lado("D-210", "D-209", `26°19'25"`, "278,77"),
  lado("D-209", "D-208", `30°34'11"`, "316,41"),
  lado("D-208", "M-2212", `180°01'19"`, "2,60"),
])

test("escaneado: ângulos e números como o OCR devolve", () => {
  perto(anguloTranscrito(`90°29'42"`).az, 90 + 29 / 60 + 42 / 3600)
  perto(anguloTranscrito(`90º29’42”`).az, 90 + 29 / 60 + 42 / 3600)
  perto(anguloTranscrito(`N 45°10'20" E`).az, 45 + 10 / 60 + 20 / 3600)
  perto(anguloTranscrito(`S 10°00'00" W`).az, 190)
  perto(anguloTranscrito(`00 24 33`).az, 24 / 60 + 33 / 3600)
  assert.equal(anguloTranscrito(`90°61'00"`), undefined)
  assert.equal(numeroTranscrito("2.062,35"), 2062.35)
  assert.equal(numeroTranscrito("4.623,040 m"), 4623.04)
  assert.equal(numeroTranscrito("250.16"), 250.16)
  assert.equal(numeroTranscrito("51,5297"), 51.5297)
  assert.equal(numeroTranscrito(null), undefined)
})

for (const [nome, tr, lados, perDecl, areaDecl] of [
  ["lote 07 (4 lados)", LOTE_07, 4, 4623.04, 51.5297],
  ["lote 56 (28 lados, igarapé)", LOTE_56, 28, 6953.942, 209.3554],
]) {
  test(`escaneado ${nome}: tabela completa, fecha e confere com área e perímetro`, () => {
    const m = memorialDaTranscricao(tr)
    assert.equal(m.segmentos.length, lados)
    assert.deepEqual(m.avisos, [])
    assert.equal(m.inicio, m.segmentos[0].de)
    assert.equal(m.segmentos.at(-1).para, m.segmentos[0].de)
    perto(m.perimetroM, perDecl, 1e-9)
    perto(m.areaHa, areaDecl, 1e-9)
    const pol = montarPoligonal(m.segmentos)
    assert.ok(pol.compensada)
    perto(pol.perimetroM, perDecl, 0.05)
    // Levantamento de 1983 (teodolito + estádia): aceita 0,1% de diferença de área.
    perto(pol.areaM2 / 10000, areaDecl, areaDecl * 0.001)
    assert.ok(pol.fechamentoLinearM < 5, `fechamento ${pol.fechamentoLinearM}`)
    // A mesma conferência da cascata de OCR aprova a transcrição correta.
    const { avaliarMemorial } = require(dir + "ocr.js")
    assert.equal(avaliarMemorial(m).aprovada, true)
  })
}

test("escaneado: lado ilegível vira aviso e a sequência quebrada é apontada", () => {
  const tr = { ...LOTE_07, lados: [LOTE_07.lados[0], lado("M-1341", "M-1376", "ilegível", "2.062,35"), ...LOTE_07.lados.slice(2)] }
  const m = memorialDaTranscricao(tr)
  assert.equal(m.segmentos.length, 3)
  assert.ok(m.avisos.some((a) => a.includes("ângulo")))
  assert.ok(m.avisos.some((a) => a.includes("sequência")))
})

test("escaneado: coordenada transcrita passa pelo leitor de coordenada inicial", () => {
  const tr = { ...LOTE_07, coordenadaInicial: { vertice: "M-1343", este: "289.123,45", norte: "8.654.321,00", latitude: null, longitude: null, fuso: "20", datum: "SAD-69" } }
  const c = lerCoordenadaInicial(textoDaCoordenada(tr), "M-1343")
  assert.equal(c.vertice, "M-1343")
  perto(c.este, 289123.45)
  perto(c.norte, 8654321)
  assert.equal(c.fuso, 20)
  assert.equal(c.datum, "SAD69")
  assert.equal(textoDaCoordenada(LOTE_07), undefined)
})

test("tabela 'DADOS DO PERÍMETRO' com texto (lados separados por hífen)", () => {
  const txt = `MEMORIAL DESCRITIVO GLEBA: 05 LOTE: 07 ÁREA 51,5297 ha PER: 4.623,040 m DADOS DO PERÍMETRO LADOS AZIMUTES COMPRIMENTOS OBSERVAÇÕES
M-1343 - M-1341 90°29'42" 250,16 L-25
M-1341 - M-1376 180°25'13" 2.062,35
M-1376 - M-1377 270°51'27" 249,76 L-27
M-1377 - M-1343 00°24'33" 2.060,77`
  const m = lerMemorial(txt)
  assert.equal(m.segmentos.length, 4)
  assert.equal(m.segmentos[0].de, "M-1343")
  assert.equal(m.segmentos[1].distancia, 2062.35)
  assert.equal(m.segmentos[3].para, "M-1343")
})

// ---------- Cascata de OCR (lib/vertix-core/ocr.ts) ----------
const { planejarMotores, normalizarOcr, avaliarMemorialOcr } = require(dir + "ocr.js")

test("OCR: ordem dos motores conforme páginas, tamanho e configuração", () => {
  const todos = new Set(["tesseract", "ocrspace", "azure", "google", "claude"])
  // 2 páginas, 150 KB: local, Azure (2 págs. grátis), OCR.space (≤1 MB/3 págs.), Google, Claude.
  assert.deepEqual(planejarMotores({ paginas: 2, bytes: 150_000 }, todos), ["tesseract", "azure", "ocrspace", "google", "claude"])
  // 3 páginas: o Azure grátis só leria 2, fica de fora.
  assert.deepEqual(planejarMotores({ paginas: 3, bytes: 500_000 }, todos), ["tesseract", "ocrspace", "google", "claude"])
  // Arquivo grande: só local e Google.
  assert.deepEqual(planejarMotores({ paginas: 8, bytes: 3_000_000 }, todos), ["tesseract", "google", "claude"])
  // Muitas páginas: nem o Tesseract (tempo de CPU).
  assert.deepEqual(planejarMotores({ paginas: 40, bytes: 9_000_000 }, todos), ["google", "claude"])
  // Sem chaves: só o local.
  assert.deepEqual(planejarMotores({ paginas: 2, bytes: 150_000 }, new Set(["tesseract"])), ["tesseract"])
})

test("OCR: normaliza grau sobrescrito, minuto lido como 1/•, travessões e milhar com vírgula", () => {
  const t = normalizarOcr(`M-1343 — M-1341 90 29142" 250,16 L-25\nM-134] = M1376 180⁰25'13" 2,062,35\nM-2212 - M-2211 179054'50" 304,77\nD-225 - D-224 04011•52" 231,73`)
  assert.match(t, /M-1343 - M-1341 90°29'42" 250,16/)
  assert.match(t, /M-1341 - M-1376 180°25'13" 2\.062,35/)
  assert.match(t, /179°54'50"/)
  assert.match(t, /04°11'52"/)
  // Não mexe em ângulo já correto nem em número comum.
  assert.equal(normalizarOcr(`90°29'42" 250,16`), `90°29'42" 250,16`)
})

const textoOcrLote07 = `MEMORIAL DESCRITIVO
GLEBA: 05 LOTE: 07 ÁREA 51,5297 ha. PER: 4.623,040 m
DADOS DO PERÍMETRO
LADOS AZIMUTES COMPRIMENTOS OBSERVAÇÕES
M-1343 — M-1341 90⁰29'42" 250,16 L-25
M-1341 — M-1376 180⁰25'13" 2.062,35
M-1376 — M-1377 270⁰51'27" 249,76 L-27
M-1377 — M-1343 00⁰24'33" 2.060,77`

test("OCR: leitura boa é aprovada pela conferência com o perímetro declarado", () => {
  const a = avaliarMemorialOcr(textoOcrLote07)
  assert.equal(a.aprovada, true, a.motivo)
  assert.equal(a.memorial.segmentos.length, 4)
  perto(a.memorial.perimetroM, 4623.04)
})

test("OCR: dígito trocado reprova a leitura (cascata passa ao próximo motor)", () => {
  const a = avaliarMemorialOcr(textoOcrLote07.replace("2.062,35", "2.082,35"))
  assert.equal(a.aprovada, false)
  assert.match(a.motivo, /perímetro declarado/)
  const b = avaliarMemorialOcr(textoOcrLote07.replace("M-1376 — M-1377", "M-1376 — M-1371"))
  assert.equal(b.aprovada, false)
})

test("OCR: tabela em Markdown (OCR.space motor 3) é lida e aprovada", () => {
  const md = `MEMORIAL DESCRITIVO
GLEBA: 05 LOTE: 07 ÁREA 51,5297 ha. PER: 4.623,040 m

| LADOS | AZIMUTES | COMPRIMENTOS | OBSERVAÇÕES |
|---|---|---|---|
| M-1343 - M-1341 | 90°29'42" | 250,16 | L-25 |
| M-1341 - M-1376 | 180°25'13" | 2.062,35 | |
| M-1376 - M-1377 | 270°51'27" | 249,76 | L-27 |
| M-1377 - M-1343 | 00°24'33" | 2.060,77 | |`
  const t = normalizarOcr(md)
  assert.doesNotMatch(t, /\|/)
  assert.doesNotMatch(t, /M-13411/)
  const a = avaliarMemorialOcr(md)
  assert.equal(a.aprovada, true, a.motivo)
  assert.equal(a.memorial.segmentos.length, 4)
})
