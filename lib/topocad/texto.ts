import type { ItemTexto } from "./tipos";

/**
 * Normaliza variantes Unicode de grau/minuto/segundo ANTES da regex.
 * As trocas só valem ao lado de dígitos, para não mexer em apóstrofos
 * e ordinais dentro do texto de confrontação (ex.: "D’Oeste", "Nº 5").
 */
export function normalizarTexto(t: string): string {
  return t
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .replace(/[   ]/g, " ")
    .replace(/(?<=\d)[′’‘´]/g, "'")
    .replace(/(?<=\d)[″”“]/g, '"')
    .replace(/(?<=\d)''(?=\s)/g, '"')
    .replace(/(?<=\d)[º˚∘](?=\d)/g, "°")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n");
}

/**
 * Reconstrói linhas a partir de itens de texto com coordenadas (unpdf / pdfjs-dist).
 * Agrupa por y (tolerância `tolY`), ordena por x e junta com um espaço.
 * Chame uma vez por página e concatene as linhas.
 */
export function reconstruirLinhas(itens: ItemTexto[], tolY = 2): string[] {
  const validos = itens.filter((i) => i.texto.trim() !== "");
  const porY = [...validos].sort((a, b) => b.y - a.y || a.x - b.x);
  const grupos: { y: number; itens: ItemTexto[] }[] = [];
  for (const it of porY) {
    const g = grupos[grupos.length - 1];
    if (g && Math.abs(g.y - it.y) <= tolY) g.itens.push(it);
    else grupos.push({ y: it.y, itens: [it] });
  }
  return grupos.map((g) =>
    g.itens
      .sort((a, b) => a.x - b.x)
      .map((i) => i.texto.trim())
      .join(" "),
  );
}
