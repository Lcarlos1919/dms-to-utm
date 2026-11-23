import assert from "node:assert/strict"
import test from "node:test"
import { separarPaginasGemini } from "./gemini.ts"

test("separa a transcrição do Gemini por marcador de página e ignora páginas não pedidas", () => {
  const resposta = [
    "=== PÁGINA 1 ===",
    "LOTE 01 AREA 12,5 ha",
    "NORTE- Lote 40",
    "=== PÁGINA 2 ===",
    "SUL- Lote 17",
    "=== PÁGINA 3 ===",
    "texto que não foi pedido",
  ].join("\n")
  const mapa = separarPaginasGemini(resposta, [1, 2])
  assert.equal(mapa.get(1), "LOTE 01 AREA 12,5 ha\nNORTE- Lote 40")
  assert.equal(mapa.get(2), "SUL- Lote 17")
  assert.equal(mapa.has(3), false)
})

test("página sem texto na resposta não entra no resultado", () => {
  const mapa = separarPaginasGemini("=== PÁGINA 1 ===\n   \n=== PÁGINA 2 ===\nOESTE- Lote 05", [1, 2])
  assert.equal(mapa.has(1), false)
  assert.equal(mapa.get(2), "OESTE- Lote 05")
})
