"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, Map as MapIcon } from "lucide-react"

/** Chave pública do Google Maps (restrita por domínio no Google Cloud). Sem ela, o painel usa o mapa de satélite aberto. */
export const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""

export interface PontoGeo {
  lat: number
  lon: number
  nome?: string
}

type GoogleNs = any

const CALLBACK = "__vertixGoogleMapsPronto"
let carregamento: Promise<GoogleNs> | null = null

/** Carrega a API uma única vez na página. */
function carregarGoogleMaps(key: string): Promise<GoogleNs> {
  const w = window as unknown as Record<string, any>
  if (w.google?.maps) return Promise.resolve(w.google)
  if (!carregamento) {
    carregamento = new Promise((resolve, reject) => {
      w[CALLBACK] = () => resolve(w.google)
      const script = document.createElement("script")
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&callback=${CALLBACK}&v=weekly`
      script.async = true
      script.onerror = () => {
        carregamento = null
        reject(new Error("Não foi possível carregar o Google Maps."))
      }
      document.head.appendChild(script)
    })
  }
  return carregamento
}

/** Link para abrir o mesmo ponto no Google Earth Web (vista 3D de satélite). */
export function linkGoogleEarth(lat: number, lon: number) {
  return `https://earth.google.com/web/@${lat.toFixed(6)},${lon.toFixed(6)},0a,1500d,35y,0h,45t,0r`
}

/**
 * Mapa de satélite com rótulos (Google Maps, híbrido) para mostrar o imóvel como no Google Earth.
 * Desenha o polígono do memorial, o contorno de referência (ex.: lote da base) e os vértices.
 */
export function MapaGoogle({
  poligono,
  contorno = [],
  vertices = [],
  altura = 420,
  rotuloAcessivel,
}: {
  poligono: PontoGeo[]
  contorno?: PontoGeo[]
  vertices?: PontoGeo[]
  altura?: number
  rotuloAcessivel: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    const todos = [...poligono, ...contorno]
    if (!ref.current || !todos.length) return

    carregarGoogleMaps(GOOGLE_MAPS_KEY)
      .then((google) => {
        if (!vivo || !ref.current) return
        const bounds = new google.maps.LatLngBounds()
        todos.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lon }))

        const mapa = new google.maps.Map(ref.current, {
          mapTypeId: "hybrid",
          tilt: 0,
          fullscreenControl: true,
          streetViewControl: false,
          mapTypeControl: true,
          gestureHandling: "greedy",
        })
        mapa.fitBounds(bounds, 60)

        if (contorno.length >= 3) {
          new google.maps.Polygon({
            paths: contorno.map((p) => ({ lat: p.lat, lng: p.lon })),
            strokeColor: "#38bdf8",
            strokeOpacity: 0.9,
            strokeWeight: 2,
            fillOpacity: 0,
            map: mapa,
          })
        }
        if (poligono.length >= 3) {
          new google.maps.Polygon({
            paths: poligono.map((p) => ({ lat: p.lat, lng: p.lon })),
            strokeColor: "#84cc16",
            strokeOpacity: 1,
            strokeWeight: 3,
            fillColor: "#84cc16",
            fillOpacity: 0.18,
            map: mapa,
          })
        }
        vertices.forEach((v) => {
          new google.maps.Marker({
            position: { lat: v.lat, lng: v.lon },
            map: mapa,
            title: v.nome,
            label: v.nome ? { text: v.nome, color: "#ffffff", fontSize: "12px", fontWeight: "600" } : undefined,
          })
        })
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível carregar o mapa.")
      })

    return () => {
      vivo = false
    }
    // o mapa é montado uma vez por conjunto de pontos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poligono, contorno, vertices])

  const centro = poligono[0] ?? contorno[0]

  return (
    <div className="w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-900" role="region" aria-label={rotuloAcessivel}>
      {erro ? (
        <div className="flex items-center justify-center p-6 text-center text-sm text-zinc-400" style={{ height: altura }} role="alert">
          <MapIcon className="mr-2 size-5" aria-hidden="true" /> {erro}
        </div>
      ) : (
        <div ref={ref} style={{ height: altura }} className="w-full" />
      )}
      {centro && (
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-2 text-xs text-zinc-400">
          <span>Imagem de satélite com rótulos</span>
          <a href={linkGoogleEarth(centro.lat, centro.lon)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-zinc-200 underline-offset-4 hover:underline">
            Abrir no Google Earth <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  )
}
