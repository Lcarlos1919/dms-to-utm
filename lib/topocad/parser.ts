import type { Aviso, VerticeBruto } from "./tipos";
import { normalizarTexto } from "./texto";

/**
 * Mesma estrutura da regex do teste_automacao.py (grupos nomeados em JS: (?<nome>...)).
 * Aceita vírgula ou ponto decimal em coordenadas, altitude e distância.
 */
export const PADRAO_VERTICE =
  /(?<codigo>[A-Z0-9]+-[A-Z]-\d+)\s+(?<lon_d>-?\d+)°(?<lon_m>\d+)'(?<lon_s>[\d.,]+)"\s+(?<lat_d>-?\d+)°(?<lat_m>\d+)'(?<lat_s>[\d.,]+)"\s+(?<altitude>-?[\d.,]+|-)\s+(?<vante>[A-Z0-9]+-[A-Z]-\d+)\s+(?<az_d>\d+)°(?<az_m>\d+)'\s+(?<distancia>[\d.,]+)\s+(?<confrontacao>.+)/;

const COMECA_COM_CODIGO = /^[A-Z0-9]+-[A-Z]-\d+\s/;
type SeparadorDecimal = "," | ".";

function agrupamentoMilharValido(grupos: string[]) {
  return grupos.length > 1 &&
    grupos[0]!.length > 0 &&
    grupos[0]!.length <= 3 &&
    grupos[0] !== "0" &&
    grupos.slice(1).every((grupo) => grupo.length === 3);
}

function detectarSeparadorDecimal(textoNormalizado: string): SeparadorDecimal {
  const votos: Record<SeparadorDecimal, number> = { ",": 0, ".": 0 };

  for (const correspondencia of textoNormalizado.matchAll(/[+-]?\d+(?:[.,]\d+)+/g)) {
    const token = correspondencia[0];
    const virgula = token.lastIndexOf(",");
    const ponto = token.lastIndexOf(".");

    if (virgula >= 0 && ponto >= 0) {
      votos[ponto > virgula ? "." : ","] += 1;
      continue;
    }

    const separador: SeparadorDecimal = ponto >= 0 ? "." : ",";
    const grupos = token.split(separador);
    const milhar = agrupamentoMilharValido(grupos);
    if (!milhar) votos[separador] += 1;
  }

  for (const correspondencia of textoNormalizado.matchAll(/\d+\s*°\s*\d+\s*'\s*\d+([.,])\d+\s*"/g)) {
    const separador = correspondencia[1] as SeparadorDecimal | undefined;
    if (separador) votos[separador] += 1;
  }

  return votos["."] > votos[","] ? "." : ",";
}

/** Converte formatos brasileiros e internacionais, como "1.234,56" e "1,234.56". */
export function textoParaNumero(txt: string, separadorDecimal: SeparadorDecimal = ","): number {
  const valor = txt.trim().replace(/\s+/g, "");
  if (!/^[+-]?\d+(?:[.,]\d+)*$/.test(valor)) return Number.NaN;

  const sinal = valor.startsWith("-") ? "-" : "";
  const magnitude = valor.replace(/^[+-]/, "");
  const virgula = magnitude.lastIndexOf(",");
  const ponto = magnitude.lastIndexOf(".");
  let decimal: SeparadorDecimal | undefined;

  if (virgula >= 0 && ponto >= 0) {
    decimal = ponto > virgula ? "." : ",";
  } else if (virgula >= 0 || ponto >= 0) {
    const separador: SeparadorDecimal = ponto >= 0 ? "." : ",";
    const grupos = magnitude.split(separador);
    const agrupamentoValido = agrupamentoMilharValido(grupos);
    const agrupamentoAmbiguo =
      grupos.length === 2 &&
      separador !== separadorDecimal &&
      grupos[0]!.length > 0 &&
      grupos[0]!.length <= 3 &&
      grupos[0] !== "0" &&
      grupos[1]!.length === 3;

    if (grupos.length > 2 && !agrupamentoValido) {
      const parteInteira = grupos.slice(0, -1);
      if (!agrupamentoMilharValido(parteInteira)) return Number.NaN;
      decimal = separador;
    } else if (!agrupamentoValido || grupos.length === 2 && !agrupamentoAmbiguo) {
      decimal = separador;
    }
  }

  if (!decimal) return Number(`${sinal}${magnitude.replace(/[.,]/g, "")}`);

  const indiceDecimal = magnitude.lastIndexOf(decimal);
  const inteiro = magnitude.slice(0, indiceDecimal).replace(/[.,]/g, "") || "0";
  const fracao = magnitude.slice(indiceDecimal + 1).replace(/[.,]/g, "");
  return fracao ? Number(`${sinal}${inteiro}.${fracao}`) : Number.NaN;
}

/**
 * DMS -> decimal. O hemisfério vem do PREFIXO "-" do texto dos graus
 * (int("-0") vale 0, então o sinal não pode vir do número).
 */
export function dmsParaDecimal(
  grauTexto: string,
  minuto: number,
  segundoTexto: string,
  separadorDecimal: SeparadorDecimal = ",",
): number {
  const negativo = grauTexto.startsWith("-");
  const graus = parseInt(grauTexto, 10);
  const segundos = textoParaNumero(segundoTexto, separadorDecimal);
  if (!Number.isFinite(graus) || !Number.isInteger(minuto) || minuto < 0 || minuto >= 60 || !Number.isFinite(segundos) || segundos < 0 || segundos >= 60) {
    return Number.NaN;
  }

  const dec = Math.abs(graus) + minuto / 60 + segundos / 3600;
  return negativo ? -dec : dec;
}

export interface ExtracaoVertices {
  vertices: VerticeBruto[];
  avisos: Aviso[];
}

/**
 * Extrai vértices de linhas de texto (já reconstruídas). Normaliza antes.
 *
 * Confrontação quebrada em 2+ linhas: a linha seguinte é anexada quando NÃO
 * começa com código de vértice e (a confrontação anterior termina em , ; ou
 * a linha seguinte começa em minúscula). Isso evita colar "Página 1 de 1".
 */
export function extrairVertices(linhasOuTexto: string | string[]): ExtracaoVertices {
  const bruto = Array.isArray(linhasOuTexto) ? linhasOuTexto.join("\n") : linhasOuTexto;
  const textoNormalizado = normalizarTexto(bruto);
  const separadorDecimal = detectarSeparadorDecimal(textoNormalizado);
  const linhas = textoNormalizado.split("\n").map((l) => l.trim());

  const vertices: VerticeBruto[] = [];
  const avisos: Aviso[] = [];
  let aberto = false; // última linha tratada foi vértice/continuação

  for (const linha of linhas) {
    const m = PADRAO_VERTICE.exec(linha);
    if (m?.groups) {
      const g = m.groups as Record<string, string>;
      const altitudeTexto = g.altitude!;
      const altitude = altitudeTexto === "-" ? null : textoParaNumero(altitudeTexto, separadorDecimal);
      const lon = dmsParaDecimal(g.lon_d!, parseInt(g.lon_m!, 10), g.lon_s!, separadorDecimal);
      const lat = dmsParaDecimal(g.lat_d!, parseInt(g.lat_m!, 10), g.lat_s!, separadorDecimal);
      const distancia = textoParaNumero(g.distancia!, separadorDecimal);

      vertices.push({
        seq: vertices.length + 1,
        codigo: g.codigo!,
        lonDms: `${g.lon_d}°${g.lon_m}'${g.lon_s}"`,
        latDms: `${g.lat_d}°${g.lat_m}'${g.lat_s}"`,
        lon,
        lat,
        altitude,
        vante: g.vante!,
        azimuteDms: `${g.az_d}°${g.az_m}'`,
        distancia,
        confrontacao: g.confrontacao!.trim(),
      });
      aberto = true;
      continue;
    }

    if (COMECA_COM_CODIGO.test(linha)) {
      avisos.push({
        codigo: "LINHA_NAO_RECONHECIDA",
        mensagem: "Linha parece um vértice, mas não casou com o formato esperado.",
        linha,
      });
      aberto = false;
      continue;
    }

    const ultimo = vertices[vertices.length - 1];
    if (aberto && ultimo && linha !== "") {
      if (/[,;]$/.test(ultimo.confrontacao) || /^[a-zà-ÿ]/.test(linha)) {
        ultimo.confrontacao = `${ultimo.confrontacao} ${linha}`;
        continue;
      }
    }
    aberto = false;
  }

  return { vertices, avisos };
}
