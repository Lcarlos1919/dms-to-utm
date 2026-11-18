// Testes do motor de memoriais com coordenadas (lib/topocad) usando as fixtures sintéticas.
// Rode com: pnpm run test:topocad
import assert from "node:assert/strict"
import test from "node:test"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { processarTexto, recalcularGeometria } = require("../../.test-build/topocad/motor.js")
const { lerMemorial } = require("../../.test-build/vertix-core/memorial.js")
const fixture = (nome) => readFileSync(new URL(`./__fixtures__/${nome}`, import.meta.url), "utf8")

test("memorial SIGEF sintético: 6 vértices, fuso 20S, polígono fechado", () => {
  const r = processarTexto(fixture("memorial_sintetico_01.txt"))
  assert.equal(r.ok, true)
  assert.equal(r.vertices.length, 6)
  assert.equal(r.crs.fuso, 20)
  assert.equal(r.crs.hemisferio, "S")
  assert.equal(r.crs.epsg, 31980)
  assert.equal(r.geometria.poligonoFechado, true)
  assert.ok(Math.abs(r.geometria.areaM2 - 903005.218) < 0.01)
  assert.equal(r.vertices[0].codigo, "ABCD-V-0001")
  assert.equal(r.vertices[5].vante, "ABCD-V-0001")
})

test("quebras de linha e Unicode (′ ″ º) não mudam o resultado", () => {
  const base = processarTexto(fixture("memorial_sintetico_01.txt"))
  for (const f of ["memorial_sintetico_01_quebra_linha.txt", "memorial_sintetico_01_unicode.txt"]) {
    const r = processarTexto(fixture(f))
    assert.equal(r.ok, true, f)
    assert.equal(r.vertices.length, base.vertices.length, f)
    r.vertices.forEach((v, i) => {
      assert.ok(Math.abs(v.este - base.vertices[i].este) < 1e-6, `${f} ${v.codigo} E`)
      assert.ok(Math.abs(v.norte - base.vertices[i].norte) < 1e-6, `${f} ${v.codigo} N`)
    })
  }
})

test("sem vértices: erro NENHUM_VERTICE e não vira memorial por azimute", () => {
  const texto = fixture("memorial_sintetico_02_sem_vertices.txt")
  const r = processarTexto(texto)
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, "NENHUM_VERTICE")
  assert.ok(lerMemorial(texto).segmentos.length < 3)
})

test("PDF sem texto: PDF_SEM_TEXTO", () => {
  const r = processarTexto(fixture("memorial_sintetico_02b_vazio.txt"))
  assert.equal(r.ok, false)
  assert.equal(r.erro.codigo, "PDF_SEM_TEXTO")
})

test("poligonal aberta gera aviso POLIGONO_ABERTO", () => {
  const r = processarTexto(fixture("memorial_sintetico_03_aberto.txt"))
  assert.equal(r.ok, true)
  assert.equal(r.geometria.poligonoFechado, false)
  assert.ok(r.avisos.some((a) => a.codigo === "POLIGONO_ABERTO"))
})

test("recalcular depois de editar um vértice ignora a divergência de distâncias", () => {
  const r = processarTexto(fixture("memorial_sintetico_01.txt"))
  const editados = r.vertices.map((v, i) => (i === 2 ? { ...v, este: v.este + 1, editado: true } : v))
  const g = recalcularGeometria(editados)
  assert.equal(g.geometria.divergenciaMaxDistanciaM, null)
  assert.ok(Math.abs(g.geometria.areaM2 - r.geometria.areaM2) > 0.1)
})
