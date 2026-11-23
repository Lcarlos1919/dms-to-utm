// Fuso UTM (SIRGAS 2000) a partir da longitude. Usado pela conferência de distâncias.
export const fusoDaLongitude = (lon: number) => Math.floor((lon + 180) / 6) + 1;
