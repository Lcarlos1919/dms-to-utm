import proj4 from "proj4"

export interface KmlVertexInput {
  name: string
  easting: number
  northing: number
}

export interface KmlMetadata {
  propertyName: string
  owner: string
  municipality: string
  areaHa: number
  perimeterM: number
}

export interface BuildKmlInput {
  vertices: KmlVertexInput[]
  datum: string
  zone: number
  hemisphere: "S" | "N"
  metadata: KmlMetadata
}

interface GeographicVertex {
  name: string
  longitude: number
  latitude: number
}

interface KmlCrs {
  zone: number
  hemisphere: "S" | "N"
}

const BRAZIL_BOUNDS_ERROR = "Coordenadas fora do Brasil, confira datum e fuso."

function resolveInputCrs(datum: string, zone: number, hemisphere: "S" | "N"): KmlCrs {
  const normalizedDatum = datum.trim()
  if (!normalizedDatum) throw new Error("KML indisponível: datum do projeto não identificado.")
  if (/SAD\s*69/i.test(normalizedDatum)) throw new Error("KML indisponível para SAD69 neste momento")
  if (!/(?:SIRGAS\s*2000|WGS\s*84)/i.test(normalizedDatum)) {
    throw new Error("KML indisponível: datum não suportado.")
  }
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error("KML indisponível: fuso UTM do projeto não identificado.")
  }
  if (hemisphere !== "S" && hemisphere !== "N") {
    throw new Error("KML indisponível: hemisfério UTM não identificado.")
  }
  return { zone, hemisphere }
}

function escapeXml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;"
      case "<":
        return "&lt;"
      case ">":
        return "&gt;"
      case '"':
        return "&quot;"
      case "'":
        return "&apos;"
      default:
        return character
    }
  })
}

function formatCoordinate(value: number): string {
  const rounded = Number(value.toFixed(8))
  return (Object.is(rounded, -0) ? 0 : rounded).toFixed(8)
}

function formatMetadataNumber(value: number, label: string): string {
  if (!Number.isFinite(value)) throw new Error(`O valor de ${label} não é válido para exportação KML.`)
  return String(value)
}

function convertVertex(vertex: KmlVertexInput, crs: KmlCrs): GeographicVertex {
  if (!Number.isFinite(vertex.easting) || !Number.isFinite(vertex.northing)) {
    throw new Error(`Coordenadas UTM inválidas no vértice ${vertex.name}.`)
  }

  const sourceCrs = `+proj=utm +zone=${crs.zone}${crs.hemisphere === "S" ? " +south" : ""} +datum=WGS84 +units=m +no_defs`
  const [longitude, latitude] = proj4(sourceCrs, "EPSG:4326", [vertex.easting, vertex.northing])

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    latitude < -34 || latitude > 6 ||
    longitude < -74 || longitude > -34
  ) {
    throw new Error(BRAZIL_BOUNDS_ERROR)
  }

  return { name: vertex.name, longitude, latitude }
}

function sameCoordinate(first: GeographicVertex, last: GeographicVertex) {
  return first.longitude === last.longitude && first.latitude === last.latitude
}

function dataElement(name: string, label: string, value: string | number) {
  return `<Data name="${name}"><displayName>${escapeXml(label)}</displayName><value>${escapeXml(value)}</value></Data>`
}

export function buildKml(input: BuildKmlInput): string {
  const crs = resolveInputCrs(input.datum, input.zone, input.hemisphere)
  if (input.vertices.length < 3) throw new Error("O KML requer pelo menos três vértices.")

  const convertedVertices = input.vertices.map((vertex) => convertVertex(vertex, crs))
  const ring = [...convertedVertices]
  if (!sameCoordinate(ring[0]!, ring[ring.length - 1]!)) ring.push(ring[0]!)

  const polygonCoordinates = ring
    .map((vertex) => `${formatCoordinate(vertex.longitude)},${formatCoordinate(vertex.latitude)},0`)
    .join("\n              ")
  const propertyName = escapeXml(input.metadata.propertyName)
  const owner = input.metadata.owner
  const municipality = input.metadata.municipality
  const areaHa = formatMetadataNumber(input.metadata.areaHa, "área")
  const perimeterM = formatMetadataNumber(input.metadata.perimeterM, "perímetro")

  const vertexPlacemarks = convertedVertices.map((vertex) => `
      <Placemark>
        <name>${escapeXml(vertex.name)}</name>
        <Point>
          <coordinates>${formatCoordinate(vertex.longitude)},${formatCoordinate(vertex.latitude)},0</coordinates>
        </Point>
      </Placemark>`).join("")

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>${propertyName}</name>
    <Style id="property-style">
      <LineStyle><color>fff6823b</color><width>2</width></LineStyle>
      <PolyStyle><color>66f6823b</color><fill>1</fill><outline>1</outline></PolyStyle>
    </Style>
    <Placemark>
      <name>${propertyName}</name>
      <styleUrl>#property-style</styleUrl>
      <ExtendedData>
        ${dataElement("proprietario", "Proprietário", owner)}
        ${dataElement("municipio", "Município", municipality)}
        ${dataElement("area_ha", "Área (ha)", areaHa)}
        ${dataElement("perimetro_m", "Perímetro (m)", perimeterM)}
      </ExtendedData>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>${polygonCoordinates}</coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Folder>
      <name>Vértices</name>${vertexPlacemarks}
    </Folder>
  </Document>
</kml>
`
}
