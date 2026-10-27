import assert from "node:assert/strict"
import test from "node:test"
import proj4 from "proj4"
import { buildKml } from "./kml.ts"
import { resolveKmlCrs } from "./kml-availability.ts"

const input = {
  vertices: [
    { name: "P-01", easting: 500000, northing: 7740000 },
    { name: "M-396", easting: 501000, northing: 7740000 },
    { name: "M-397", easting: 501000, northing: 7741000 },
  ],
  datum: "SIRGAS 2000",
  zone: 23,
  hemisphere: "S",
  metadata: {
    propertyName: "Fazenda São João",
    owner: "Proprietário",
    municipality: "Brasília",
    areaHa: 100,
    perimeterM: 4000,
  },
}

function polygonCoordinates(kml) {
  const match = kml.match(/<outerBoundaryIs>\s*<LinearRing>\s*<coordinates>([\s\S]*?)<\/coordinates>/)
  assert.ok(match, "deve conter as coordenadas do polígono")
  return match[1].trim().split(/\s+/).map((coordinate) => coordinate.split(",").map(Number))
}

function assertXmlWellFormed(xml) {
  const stack = []
  const tags = /<(\/)?([A-Za-z_][\w:.-]*)(?:\s+[^<>]*?)?\s*(\/?)>/g

  for (const match of xml.matchAll(tags)) {
    const [, closing, name, selfClosing] = match
    if (closing) assert.equal(stack.pop(), name, `fechamento inesperado de ${name}`)
    else if (!selfClosing) stack.push(name)
  }

  assert.deepEqual(stack, [], "todas as tags devem estar fechadas")
  const textNodes = xml.replace(/<[^>]*>/g, "")
  assert.doesNotMatch(textNodes, /&(?!amp;|lt;|gt;|quot;|apos;)/, "ampersands no texto devem estar escapados")
}

test("converte UTM para KML e retorna a UTM com erro inferior a 1 cm", () => {
  const kml = buildKml(input)
  const [longitude, latitude] = polygonCoordinates(kml)[0]
  const sourceCrs = "+proj=utm +zone=23 +south +datum=WGS84 +units=m +no_defs"
  const [easting, northing] = proj4("EPSG:4326", sourceCrs, [longitude, latitude])

  assert.ok(Math.hypot(easting - input.vertices[0].easting, northing - input.vertices[0].northing) < 0.01)
})

test("fecha o anel repetindo o primeiro ponto no final", () => {
  const coordinates = polygonCoordinates(buildKml(input))
  assert.deepEqual(coordinates[0], coordinates.at(-1))
})

test("aceita WGS84 e hemisfério Norte", () => {
  const kml = buildKml({
    ...input,
    datum: "WGS 84",
    hemisphere: "N",
    vertices: [
      { name: "P-01", easting: 500000, northing: 500000 },
      { name: "P-02", easting: 501000, northing: 500000 },
      { name: "P-03", easting: 501000, northing: 501000 },
    ],
  })
  const [longitude, latitude] = polygonCoordinates(kml)[0]

  assert.ok(Math.abs(longitude + 45) < 0.0001)
  assert.ok(latitude > 0 && latitude < 6)
})

test("emite longitude antes de latitude com oito casas decimais", () => {
  const kml = buildKml(input)
  const [longitude, latitude] = polygonCoordinates(kml)[0]
  const firstCoordinate = kml.match(/<outerBoundaryIs>\s*<LinearRing>\s*<coordinates>\s*([^\s<]+)/)?.[1]

  assert.ok(Math.abs(longitude + 45) < 0.0001)
  assert.ok(latitude < 0 && latitude > -34)
  assert.match(firstCoordinate, /^-?\d+\.\d{8},-?\d+\.\d{8},0$/)
})

test("gera XML estruturalmente bem formado e escapa caracteres especiais", () => {
  const kml = buildKml({
    ...input,
    metadata: {
      ...input.metadata,
      propertyName: `Fazenda & <Sítio> "São João" 'Sul'`,
      owner: `A&B <Proprietário> "João"`,
      municipality: `Rio & <Centro>`,
    },
    vertices: input.vertices.map((vertex, index) => ({
      ...vertex,
      name: index === 0 ? `P&-01 <Norte> "A" '1'` : vertex.name,
    })),
  })

  assertXmlWellFormed(kml)
  assert.match(kml, /Fazenda &amp; &lt;Sítio&gt; &quot;São João&quot; &apos;Sul&apos;/)
  assert.match(kml, /A&amp;B &lt;Proprietário&gt; &quot;João&quot;/)
  assert.match(kml, /P&amp;-01 &lt;Norte&gt; &quot;A&quot; &apos;1&apos;/)
  assert.equal((kml.match(/<Placemark>/g) ?? []).length, 4)
  assert.match(kml, /<name>Vértices<\/name>/)
})

test("recusa SAD69 sem produzir um arquivo", () => {
  assert.throws(
    () => buildKml({ ...input, datum: "SAD69" }),
    { message: "KML indisponível para SAD69 neste momento" },
  )
})

test("recusa coordenadas fora dos limites do Brasil", () => {
  const outsideBrazil = {
    ...input,
    vertices: input.vertices.map((vertex) => ({ ...vertex, northing: 5500000 })),
  }

  assert.throws(
    () => buildKml(outsideBrazil),
    { message: "Coordenadas fora do Brasil, confira datum e fuso." },
  )
})

test("indica a falta de datum ou fuso para desabilitar o botão KML", () => {
  assert.deepEqual(resolveKmlCrs(null, "23S", "S"), {
    ok: false,
    message: "KML indisponível: datum do projeto não identificado.",
  })
  assert.deepEqual(resolveKmlCrs("SIRGAS 2000", null, "S"), {
    ok: false,
    message: "KML indisponível: fuso UTM do projeto não identificado.",
  })
  assert.deepEqual(resolveKmlCrs("SIRGAS 2000", "23S", null), {
    ok: true,
    crs: { datum: "SIRGAS 2000", zone: 23, hemisphere: "S" },
  })
})
