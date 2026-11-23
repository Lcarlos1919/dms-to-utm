import assert from "node:assert/strict"
import test from "node:test"
import { converterPaginasAzure } from "./azure-document-intelligence.ts"

test("converte palavras do Azure (polígono em polegadas, y a partir do topo) para pontos do pdf.js", () => {
  const mapa = converterPaginasAzure([
    {
      pageNumber: 1,
      unit: "inch",
      width: 8.5,
      height: 11,
      words: [
        { content: "M-01", polygon: [1, 1, 2, 1, 2, 1.2, 1, 1.2] },
        { content: "  ", polygon: [1, 2] },
        { content: "N", polygon: [] },
      ],
    },
  ])
  const itens = mapa.get(1)
  assert.equal(itens.length, 1)
  assert.equal(itens[0].texto, "M-01")
  assert.equal(itens[0].x, 72)
  assert.equal(itens[0].y, 11 * 72 - 72)
})

test("página sem palavras vira lista vazia", () => {
  const mapa = converterPaginasAzure([{ pageNumber: 2, unit: "inch", height: 11 }])
  assert.deepEqual(mapa.get(2), [])
})
