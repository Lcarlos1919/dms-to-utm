"use client"

import { useEffect, useMemo } from "react"
import { CircleMarker, MapContainer, Polygon, Popup, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet"
import { latLngBounds, type LatLngTuple } from "leaflet"
import { utmParaGeograficas, type Vertice } from "@/lib/topocad"

type ProjectMapProps = {
  vertices: Vertice[]
  utmZone: string | null
  hemisphere: "S" | "N" | null
  datum: string | null
}

type MapPoint = {
  vertex: Vertice
  position: LatLngTuple
}

const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"

function MapBounds({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap()

  useEffect(() => {
    if (positions.length === 1) {
      map.setView(positions[0], 16)
      return
    }

    if (positions.length > 1) {
      const bounds = latLngBounds(positions)
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.18), { maxZoom: 17 })
    }
  }, [map, positions])

  return null
}

function formatMeters(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

export function ProjectMap({ vertices, utmZone, hemisphere, datum }: ProjectMapProps) {
  const crs = useMemo(() => {
    const zoneMatch = utmZone?.trim().match(/^(\d{1,2})\s*([NS])?$/i)
    const zone = zoneMatch ? Number(zoneMatch[1]) : Number.NaN
    const parsedHemisphere = hemisphere ?? (zoneMatch?.[2]?.toUpperCase() as "S" | "N" | undefined)
    const supportedDatum = !datum || /^SIRGAS\s*2000$/i.test(datum.trim())

    if (!Number.isInteger(zone) || zone < 1 || zone > 60 || !parsedHemisphere || !supportedDatum) return null
    return { zone, hemisphere: parsedHemisphere }
  }, [datum, hemisphere, utmZone])

  const points = useMemo<MapPoint[]>(() => {
    if (!crs) return []

    return vertices.flatMap((vertex) => {
      try {
        const { lon, lat } = utmParaGeograficas(vertex.este, vertex.norte, crs.zone, crs.hemisphere)
        return [{ vertex, position: [lat, lon] as LatLngTuple }]
      } catch {
        return []
      }
    })
  }, [crs, vertices])

  const positions = useMemo(() => points.map((point) => point.position), [points])

  if (!crs) {
    return (
      <div className="flex h-[420px] w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center" role="alert">
        <p className="max-w-md text-sm text-zinc-400">Não foi possível identificar um datum e fuso compatíveis para posicionar os vértices no mapa.</p>
      </div>
    )
  }

  if (points.length === 0) {
    return (
      <div className="flex h-[420px] w-full items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center" role="status">
        <p className="max-w-md text-sm text-zinc-400">Ainda não há coordenadas UTM válidas para mostrar no mapa.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900" role="region" aria-label="Mapa interativo dos vértices">
      <MapContainer
        center={positions[0]}
        zoom={15}
        zoomControl={false}
        scrollWheelZoom
        className="h-[420px] w-full bg-zinc-900"
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <ZoomControl position="topright" />
        <MapBounds positions={positions} />
        {points.length >= 3 && (
          <Polygon
            positions={positions}
            pathOptions={{ color: "#65a30d", weight: 2, fillColor: "#84cc16", fillOpacity: 0.16 }}
          />
        )}
        {points.map(({ vertex, position }) => (
          <CircleMarker
            key={`${vertex.codigo}-${vertex.seq}`}
            center={position}
            radius={6}
            pathOptions={{ color: "#f4f4f5", weight: 2, fillColor: "#65a30d", fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -5]}>{vertex.codigo}</Tooltip>
            <Popup maxWidth={220} minWidth={140} autoPanPadding={[18, 18]}>
              <div className="min-w-40 text-sm">
                <p className="font-semibold">{vertex.codigo}</p>
                <p>Este: {formatMeters(vertex.este)} m</p>
                <p>Norte: {formatMeters(vertex.norte)} m</p>
                {vertex.altitude !== null && <p>Altitude: {formatMeters(vertex.altitude)} m</p>}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
      {points.length < vertices.length && (
        <p className="border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400" role="status">
          {vertices.length - points.length} vértice(s) sem coordenadas UTM válidas foram omitidos do mapa.
        </p>
      )}
    </div>
  )
}

export default ProjectMap
