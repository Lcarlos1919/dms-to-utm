import proj4 from "proj4";
import type { Crs } from "./tipos";

/** Elipsoide GRS80 (SIRGAS 2000). */
export const GRS80 = { a: 6378137, f: 1 / 298.257222101 } as const;

const K0 = 0.9996;
const E0 = 500000;
const N0_SUL = 10000000;

/** Mesma regra do script: fuso = floor((lon + 180) / 6) + 1. */
export function fusoUtm(lon: number): number {
  return Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
}

/** Igual ao descobrir_epsg_utm do script (SIRGAS 2000 / UTM: 31954+fuso Norte, 31960+fuso Sul). */
export function descobrirEpsgUtm(lon: number, lat: number): { epsg: number; fuso: number; hemisferio: "S" | "N" } {
  const fuso = fusoUtm(lon);
  return lat < 0
    ? { epsg: 31960 + fuso, fuso, hemisferio: "S" }
    : { epsg: 31954 + fuso, fuso, hemisferio: "N" };
}

export function montarCrs(fuso: number, hemisferio: "S" | "N", epsg: number): Crs {
  return { datum: "SIRGAS 2000", fuso, hemisferio, epsg, nome: `SIRGAS 2000 / UTM zone ${fuso}${hemisferio}` };
}

const n = GRS80.f / (2 - GRS80.f);
const n2 = n * n, n3 = n2 * n, n4 = n3 * n, n5 = n4 * n, n6 = n5 * n;
const A = (GRS80.a / (1 + n)) * (1 + n2 / 4 + n4 / 64 + n6 / 256);
const alfa = [
  n / 2 - (2 * n2) / 3 + (5 * n3) / 16 + (41 * n4) / 180 - (127 * n5) / 288 + (7891 * n6) / 37800,
  (13 * n2) / 48 - (3 * n3) / 5 + (557 * n4) / 1440 + (281 * n5) / 630 - (1983433 * n6) / 1935360,
  (61 * n3) / 240 - (103 * n4) / 140 + (15061 * n5) / 26880 + (167603 * n6) / 181440,
  (49561 * n4) / 161280 - (179 * n5) / 168 + (6601661 * n6) / 7257600,
  (34729 * n5) / 80640 - (3418889 * n6) / 1995840,
  (212378941 * n6) / 319334400,
] as const;

const rad = (g: number) => (g * Math.PI) / 180;

/**
 * (lon, lat) em graus -> (este, norte) em metros, UTM no fuso dado.
 * Série de Krüger (6ª ordem, Karney 2011), sem arredondar.
 */
export function geograficasParaUtm(lon: number, lat: number, fuso: number, sul: boolean): { este: number; norte: number } {
  const lon0 = fuso * 6 - 183;
  const phi = rad(lat);
  const dl = rad(lon - lon0);
  const e = Math.sqrt(GRS80.f * (2 - GRS80.f));

  const sinPhi = Math.sin(phi);
  const t = Math.sinh(Math.atanh(sinPhi) - e * Math.atanh(e * sinPhi));
  const xiLinha = Math.atan2(t, Math.cos(dl));
  const etaLinha = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));

  let xi = xiLinha;
  let eta = etaLinha;
  for (let j = 1; j <= 6; j++) {
    const a = alfa[j - 1]!;
    xi += a * Math.sin(2 * j * xiLinha) * Math.cosh(2 * j * etaLinha);
    eta += a * Math.cos(2 * j * xiLinha) * Math.sinh(2 * j * etaLinha);
  }

  return {
    este: E0 + K0 * A * eta,
    norte: (sul ? N0_SUL : 0) + K0 * A * xi,
  };
}

/** Converte coordenadas UTM SIRGAS 2000 / GRS80 para longitude e latitude. */
export function utmParaGeograficas(
  este: number,
  norte: number,
  fuso: number,
  hemisferio: "S" | "N",
): { lon: number; lat: number } {
  if (
    !Number.isFinite(este) ||
    !Number.isFinite(norte) ||
    !Number.isInteger(fuso) ||
    fuso < 1 ||
    fuso > 60 ||
    este < 100_000 ||
    este > 900_000 ||
    norte < 0 ||
    norte > 10_000_000
  ) {
    throw new Error("Coordenadas UTM inválidas.");
  }

  const utm = `+proj=utm +zone=${fuso}${hemisferio === "S" ? " +south" : ""} +ellps=GRS80 +units=m +no_defs +type=crs`;
  const geografico = "+proj=longlat +ellps=GRS80 +no_defs +type=crs";
  const [lon, lat] = proj4(utm, geografico, [este, norte]);

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error("Não foi possível transformar as coordenadas UTM.");
  }

  return { lon, lat };
}

/** Arredonda a 3 casas, como o round(x, 3) do script. */
export const arredondar3 = (x: number): number => Math.round(x * 1000) / 1000;
