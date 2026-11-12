"use client"

import { useEffect, useMemo } from "react"
import { CircleMarker, LayersControl, MapContainer, Polygon, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet"
import { latLngBounds, type LatLngTuple } from "leaflet"

export interface PontoMapa {
  nome: string
  lon: number
  lat: number
}

const par = (p: { lon: number; lat: number }): LatLngTuple => [p.lat, p.lon]

function Enquadrar({ pontos }: { pontos: LatLngTuple[] }) {
  const map = useMap()
  useEffect(() => {
    if (!pontos.length) return
    const limites = latLngBounds(pontos)
    if (limites.isValid()) map.fitBounds(limites.pad(0.2), { maxZoom: 19 })
  }, [map, pontos])
  return null
}

/**
 * Mostra o contorno do lote na base (tracejado) e a poligonal do memorial na posição escolhida.
 * Só desenha; quem confirma é o usuário, fora do mapa.
 */
export function AzimuteMapa({ lote, poligonal }: { lote: [number, number][]; poligonal: PontoMapa[] }) {
  const contornoLote = useMemo(() => lote.map(([lon, lat]) => [lat, lon] as LatLngTuple), [lote])
  const contornoMemorial = useMemo(() => poligonal.map(par), [poligonal])
  const enquadrar = useMemo(() => [...contornoLote, ...contornoMemorial], [contornoLote, contornoMemorial])
  if (!enquadrar.length) return null

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900" role="region" aria-label="Mapa com o lote da base e a posição do memorial">
      <MapContainer center={enquadrar[0]} zoom={16} maxZoom={21} zoomControl={false} scrollWheelZoom className="h-[420px] w-full bg-zinc-900">
        <ZoomControl position="topright" />
        <LayersControl position="topleft">
          <LayersControl.BaseLayer checked name="Satélite">
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Imagens &copy; Esri, Maxar, Earthstar Geographics"
              maxNativeZoom={19}
              maxZoom={21}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Ruas">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxNativeZoom={19} maxZoom={21} attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
          </LayersControl.BaseLayer>
        </LayersControl>
        <Enquadrar pontos={enquadrar} />
        {contornoLote.length >= 3 && (
          <Polygon positions={contornoLote} pathOptions={{ color: "#38bdf8", weight: 2, dashArray: "6 6", fillOpacity: 0.04 }}>
            <Tooltip sticky>Lote na base fundiária</Tooltip>
          </Polygon>
        )}
        {contornoMemorial.length >= 3 && (
          <Polygon positions={contornoMemorial} pathOptions={{ color: "#84cc16", weight: 2, fillColor: "#84cc16", fillOpacity: 0.2 }} />
        )}
        {poligonal.map((p) => (
          <CircleMarker key={p.nome} center={par(p)} radius={5} pathOptions={{ color: "#f4f4f5", weight: 2, fillColor: "#84cc16", fillOpacity: 1 }}>
            <Tooltip direction="top" offset={[0, -5]} permanent>
              {p.nome}
            </Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400">
        <span><span className="mr-1 inline-block h-0.5 w-4 border-t-2 border-dashed border-sky-400 align-middle" />contorno do lote na base</span>
        <span><span className="mr-1 inline-block h-2 w-4 rounded-sm bg-lime-500/60 align-middle" />poligonal do memorial</span>
      </p>
    </div>
  )
}

export default AzimuteMapa
