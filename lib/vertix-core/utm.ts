// UTM <-> lon/lat (GRS80 ~ SIRGAS 2000 ~ WGS84 para fins de KML). Série de Krüger.
const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
const n = f / (2 - f);
const A = (a / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
const al = [n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3, (13 / 48) * n ** 2 - (3 / 5) * n ** 3, (61 / 240) * n ** 3];
const be = [n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3, n ** 2 / 48 + n ** 3 / 15, (17 / 480) * n ** 3];
const rad = (d: number) => (d * Math.PI) / 180, deg = (r: number) => (r * 180) / Math.PI;
const e = Math.sqrt(f * (2 - f));
export const meridianoCentral = (fuso: number) => -183 + 6 * fuso;

export function utmParaLonLat(E: number, N: number, fuso: number, hemisferio: 'S' | 'N' = 'S'): { lon: number; lat: number } {
  const xi = (hemisferio === 'S' ? N - 10_000_000 : N) / (k0 * A), eta = (E - 500_000) / (k0 * A);
  let xp = xi, ep = eta;
  for (let j = 1; j <= 3; j++) {
    xp -= be[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    ep -= be[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xp) / Math.cosh(ep));
  // latitude conforme -> geodésica (Newton, Karney 2011): precisão sub-milimétrica
  const e2 = e * e;
  const tauP = Math.tan(chi);
  let tau = tauP;
  for (let it = 0; it < 6; it++) {
    const sigma = Math.sinh(e * Math.atanh((e * tau) / Math.sqrt(1 + tau * tau)));
    const tauPi = tau * Math.sqrt(1 + sigma * sigma) - sigma * Math.sqrt(1 + tau * tau);
    tau += ((tauP - tauPi) / Math.sqrt(1 + tauPi * tauPi)) * ((1 + (1 - e2) * tau * tau) / ((1 - e2) * Math.sqrt(1 + tau * tau)));
  }
  const phi = Math.atan(tau);
  const lon = meridianoCentral(fuso) + deg(Math.atan2(Math.sinh(ep), Math.cos(xp)));
  return { lon, lat: deg(phi) };
}

export function lonLatParaUtm(lon: number, lat: number, fuso: number): { E: number; N: number } {
  const phi = rad(lat), lam = rad(lon - meridianoCentral(fuso));
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - ((2 * Math.sqrt(n)) / (1 + n)) * Math.atanh(((2 * Math.sqrt(n)) / (1 + n)) * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(lam)), eta = Math.atanh(Math.sin(lam) / Math.sqrt(1 + t * t));
  let xs = xi, es = eta;
  for (let j = 1; j <= 3; j++) {
    xs += al[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    es += al[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  return { E: 500_000 + k0 * A * es, N: (lat < 0 ? 10_000_000 : 0) + k0 * A * xs };
}
