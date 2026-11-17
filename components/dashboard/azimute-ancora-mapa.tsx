"use client"

import { useEffect, useMemo } from "react"
import { CircleMarker, LayersControl, MapContainer, Polygon, TileLayer, Tooltip, ZoomControl, useMap, useMapEvents } from "react-leaflet"
import { latLngBounds, type LatLngTuple } from "leaflet"
import { utmParaLonLat } from "@/lib/vertix-core/utm"

type Utm = [number, number]

export interface AncoraMapaProps {
  fuso: number
  hemisferio: "S" | "N"
  lote: { anel: Utm[]; fuso: number; hemisferio: "S" | "N" } | null
  poligonal: { nome: string; este: number; norte: number }[] | null
  verticeAncora: string | null
  onClique?: (lat: number, lon: number) => void
}

const OSM = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
const SATELITE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
const BRASIL: LatLngTuple = [-10.9, -62.9] // Rondônia, onde está a base fundiária

function paraLatLng([e, n]: Utm, fuso: number, hem: "S" | "N"): LatLngTuple | null {
  try {
    const { lat, lon } = utmParaLonLat(e, n, fuso, hem)
    return Number.isFinite(lat) && Number.isFinite(lon) ? [lat, lon] : null
  } catch {
    return null
  }
}

function Enquadrar({ pontos }: { pontos: LatLngTuple[] }) {
  const map = useMap()
  const chave = pontos.map((p) => p.join(",")).join(";")
  useEffect(() => {
    if (pontos.length === 1) map.setView(pontos[0], 16)
    else if (pontos.length > 1) {
      const b = latLngBounds(pontos)
      if (b.isValid()) map.fitBounds(b.pad(0.25), { maxZoom: 17 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, chave])
  return null
}

function Clique({ onClique }: { onClique?: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onClique?.(e.latlng.lat, e.latlng.lng) })
  return null
}

export function AncoraMapa({ fuso, hemisferio, lote, poligonal, verticeAncora, onClique }: AncoraMapaProps) {
  const loteLL = useMemo<LatLngTuple[]>(
    () => (lote?.anel ?? []).flatMap((p) => {
      const ll = paraLatLng(p, lote!.fuso, lote!.hemisferio)
      return ll ? [ll] : []
    }),
    [lote],
  )
  const polLL = useMemo(
    () => (poligonal ?? []).flatMap((v) => {
      const ll = paraLatLng([v.este, v.norte], fuso, hemisferio)
      return ll ? [{ nome: v.nome, ll }] : []
    }),
    [poligonal, fuso, hemisferio],
  )
  const enquadrar = polLL.length ? polLL.map((p) => p.ll) : loteLL

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900" role="region" aria-label="Mapa para escolher o ponto de partida">
      <MapContainer center={BRASIL} zoom={6} zoomControl={false} scrollWheelZoom className={`h-[460px] w-full bg-zinc-900 ${onClique ? "cursor-crosshair" : ""}`}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Satélite">
            <TileLayer url={SATELITE} attribution="Imagens &copy; Esri" maxZoom={19} />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Mapa">
            <TileLayer url={OSM} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' />
          </LayersControl.BaseLayer>
        </LayersControl>
        <ZoomControl position="bottomright" />
        <Enquadrar pontos={enquadrar} />
        <Clique onClique={onClique} />
        {loteLL.length >= 3 && (
          <Polygon positions={loteLL} pathOptions={{ color: "#f59e0b", weight: 2, dashArray: "6 4", fillOpacity: 0.05 }}>
            <Tooltip sticky>Lote na base fundiária</Tooltip>
          </Polygon>
        )}
        {polLL.length >= 3 && (
          <Polygon positions={polLL.map((p) => p.ll)} pathOptions={{ color: "#65a30d", weight: 2, fillColor: "#84cc16", fillOpacity: 0.2 }} />
        )}
        {polLL.map((p) => (
          <CircleMarker
            key={p.nome}
            center={p.ll}
            radius={p.nome === verticeAncora ? 7 : 4}
            pathOptions={{ color: "#f4f4f5", weight: 2, fillColor: p.nome === verticeAncora ? "#ef4444" : "#65a30d", fillOpacity: 1 }}
          >
            <Tooltip direction="top" offset={[0, -5]}>{p.nome}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  )
}

export default AncoraMapa
