import { GRS80 } from "./utm";

/**
 * Distância geodésica no elipsoide GRS80 (problema inverso de Vincenty).
 * Entradas em graus; saída em metros. Devolve NaN se não convergir
 * (pontos quase antípodas, irrelevante para glebas).
 */
export function distanciaGeodesica(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const { a, f } = GRS80;
  const b = a * (1 - f);
  const rad = (g: number) => (g * Math.PI) / 180;

  const L = rad(lon2 - lon1);
  const U1 = Math.atan((1 - f) * Math.tan(rad(lat1)));
  const U2 = Math.atan((1 - f) * Math.tan(rad(lat2)));
  const sinU1 = Math.sin(U1), cosU1 = Math.cos(U1);
  const sinU2 = Math.sin(U2), cosU2 = Math.cos(U2);

  let lambda = L;
  let sinSigma = 0, cosSigma = 0, sigma = 0, cos2Alfa = 0, cos2SigmaM = 0;
  for (let i = 0; i < 200; i++) {
    const sinL = Math.sin(lambda), cosL = Math.cos(lambda);
    sinSigma = Math.hypot(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL);
    if (sinSigma === 0) return 0; // pontos coincidentes
    cosSigma = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinSigma, cosSigma);
    const sinAlfa = (cosU1 * cosU2 * sinL) / sinSigma;
    cos2Alfa = 1 - sinAlfa * sinAlfa;
    cos2SigmaM = cos2Alfa !== 0 ? cosSigma - (2 * sinU1 * sinU2) / cos2Alfa : 0;
    const C = (f / 16) * cos2Alfa * (4 + f * (4 - 3 * cos2Alfa));
    const anterior = lambda;
    lambda = L + (1 - C) * f * sinAlfa * (sigma + C * sinSigma * (cos2SigmaM + C * cosSigma * (-1 + 2 * cos2SigmaM * cos2SigmaM)));
    if (Math.abs(lambda - anterior) < 1e-12) {
      const u2 = (cos2Alfa * (a * a - b * b)) / (b * b);
      const A = 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)));
      const B = (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2)));
      const dSigma =
        B * sinSigma * (cos2SigmaM + (B / 4) * (cosSigma * (-1 + 2 * cos2SigmaM ** 2) - (B / 6) * cos2SigmaM * (-3 + 4 * sinSigma ** 2) * (-3 + 4 * cos2SigmaM ** 2)));
      return b * A * (sigma - dSigma);
    }
  }
  return NaN;
}
