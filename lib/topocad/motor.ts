import type { Aviso, ItemTexto, OpcoesMotor, ResultadoMotor, Geometria, Vertice, VerticeBruto } from "./tipos";
import { extrairVertices } from "./parser";
import { reconstruirLinhas } from "./texto";
import { arredondar3, descobrirEpsgUtm, fusoUtm, geograficasParaUtm, montarCrs } from "./utm";
import { calcularGeometria } from "./geometria";
import { distanciaGeodesica } from "./geodesia";
import { avisoFusoDiferente, detectarParametrosMemorial } from "./detectar-parametros";

/**
 * Vértice digitado à mão (ou vindo de outra fonte): só código, lon e lat (graus decimais) são obrigatórios.
 * Padrões: vante = próximo vértice da lista (o último aponta para o primeiro);
 * distância = geodésica até a vante (arredondada a 2 casas); demais campos vazios/null.
 */
export type EntradaVertice = Pick<VerticeBruto, "codigo" | "lon" | "lat"> &
  Partial<Omit<VerticeBruto, "seq" | "codigo" | "lon" | "lat">>;

/** Pipeline a partir de vértices já estruturados (fuso, UTM, geometria, avisos). */
export function processarVertices(
  entrada: EntradaVertice[],
  opcoes: OpcoesMotor = {},
  avisosIniciais: Aviso[] = [],
): ResultadoMotor {
  const {
    limiteDivergenciaM = 0.1,
    fusoDeclarado,
    hemisferioDeclarado,
    fusoMin = 18,
    fusoMax = 25,
  } = opcoes;

  if (entrada.length === 0) {
    return {
      ok: false,
      avisos: avisosIniciais,
      erro: { codigo: "NENHUM_VERTICE", mensagem: "Não encontramos a tabela de vértices. Você pode digitá-los manualmente." },
    };
  }

  const n = entrada.length;
  const porCodigo = new Map(entrada.map((e) => [e.codigo, e]));
  const brutos: VerticeBruto[] = entrada.map((e, i) => {
    const proximo = entrada[(i + 1) % n]!;
    const vante = e.vante ?? proximo.codigo;
    const alvo = porCodigo.get(vante) ?? proximo;
    return {
      seq: i + 1,
      codigo: e.codigo,
      lonDms: e.lonDms ?? "",
      latDms: e.latDms ?? "",
      lon: e.lon,
      lat: e.lat,
      altitude: e.altitude ?? null,
      vante,
      azimuteDms: e.azimuteDms ?? "",
      distancia: e.distancia ?? Math.round(distanciaGeodesica(e.lon, e.lat, alvo.lon, alvo.lat) * 100) / 100,
      confrontacao: e.confrontacao ?? "",
    };
  });

  const coordenadaInvalida = brutos.some(
    (vertice) =>
      !Number.isFinite(vertice.lon) ||
      !Number.isFinite(vertice.lat) ||
      vertice.lon < -180 ||
      vertice.lon > 180 ||
      vertice.lat < -80 ||
      vertice.lat > 84 ||
      (vertice.altitude !== null && !Number.isFinite(vertice.altitude)) ||
      !Number.isFinite(vertice.distancia) ||
      vertice.distancia < 0,
  );
  if (coordenadaInvalida) {
    return {
      ok: false,
      avisos: avisosIniciais,
      erro: {
        codigo: "COORDENADA_INVALIDA",
        mensagem: "O memorial contém coordenadas, altitude ou distâncias inválidas para a conversão.",
      },
    };
  }

  const lonMedia = brutos.reduce((s, v) => s + v.lon, 0) / n;
  const latMedia = brutos.reduce((s, v) => s + v.lat, 0) / n;
  const referenciaCalculada = descobrirEpsgUtm(lonMedia, latMedia);
  const hemisferiosDosVertices = new Set(
    brutos.filter((vertice) => vertice.lat !== 0).map((vertice) => (vertice.lat < 0 ? "S" : "N")),
  );

  if (hemisferiosDosVertices.size > 1) {
    return {
      ok: false,
      avisos: avisosIniciais,
      erro: {
        codigo: "COORDENADA_INVALIDA",
        mensagem: "Os vértices estão em hemisférios diferentes; não é seguro projetar o polígono em uma única zona UTM.",
      },
    };
  }

  const fuso = fusoDeclarado ?? referenciaCalculada.fuso;
  const hemisferio = hemisferioDeclarado ?? referenciaCalculada.hemisferio;
  const epsg = hemisferio === "S" ? 31960 + fuso : 31954 + fuso;

  if (hemisferiosDosVertices.size === 1 && hemisferiosDosVertices.has(hemisferio === "S" ? "N" : "S")) {
    return {
      ok: false,
      avisos: avisosIniciais,
      erro: {
        codigo: "PARAMETROS_INCOMPATIVEIS",
        mensagem: `O hemisfério ${hemisferio} declarado no memorial não corresponde ao sinal das coordenadas.`,
      },
    };
  }

  if (hemisferio !== "S" || !Number.isInteger(fuso) || fuso < fusoMin || fuso > fusoMax) {
    return {
      ok: false,
      avisos: avisosIniciais,
      erro: {
        codigo: "FUSO_NAO_SUPORTADO",
        mensagem:
          hemisferio !== "S"
            ? "A conversão deste memorial aceita apenas coordenadas no hemisfério Sul."
            : `Fuso ${fuso}${hemisferio} fora da faixa suportada (${fusoMin}S a ${fusoMax}S).`,
      },
    };
  }

  const avisos: Aviso[] = [...avisosIniciais];
  if (fusoDeclarado !== undefined && fusoDeclarado !== referenciaCalculada.fuso) {
    avisos.push(avisoFusoDiferente(fusoDeclarado, referenciaCalculada.fuso));
  }
  if (new Set(brutos.map((v) => fusoUtm(v.lon))).size > 1) {
    avisos.push({
      codigo: "MULTIPLOS_FUSOS",
      mensagem: `Vértices em mais de um fuso; usado o fuso ${fuso}${hemisferio}${fusoDeclarado ? " (declarado no memorial)" : " (pela média)"}.`,
    });
  }

  const vertices: Vertice[] = brutos.map((v) => {
    const { este, norte } = geograficasParaUtm(v.lon, v.lat, fuso, true);
    return { ...v, este: arredondar3(este), norte: arredondar3(norte), editado: false };
  });

  const { geometria, avisos: avisosGeo } = calcularGeometria(vertices, limiteDivergenciaM);
  return { ok: true, crs: montarCrs(fuso, hemisferio, epsg), vertices, geometria, avisos: [...avisos, ...avisosGeo] };
}

/** Pipeline completo a partir do texto do memorial (todas as páginas, com \n entre linhas). */
export function processarTexto(texto: string, opcoes: OpcoesMotor = {}): ResultadoMotor {
  if (texto.trim() === "") {
    return {
      ok: false,
      avisos: [],
      erro: { codigo: "PDF_SEM_TEXTO", mensagem: "Este PDF parece ser uma imagem. Envie o memorial original gerado pelo SIGEF." },
    };
  }
  const parametros = detectarParametrosMemorial(texto);
  if (!parametros.ok) {
    return { ok: false, erro: parametros.erro, avisos: parametros.avisos };
  }

  const { vertices, avisos } = extrairVertices(texto);
  return processarVertices(
    vertices,
    {
      ...opcoes,
      fusoDeclarado: opcoes.fusoDeclarado ?? parametros.parametros.fusoDeclarado,
      hemisferioDeclarado: opcoes.hemisferioDeclarado ?? parametros.parametros.hemisferioDeclarado,
    },
    [...parametros.avisos, ...avisos],
  );
}

/** Pipeline a partir dos itens de texto de cada página (unpdf / pdfjs-dist). */
export function processarPaginas(paginas: ItemTexto[][], opcoes: OpcoesMotor = {}, tolY = 2): ResultadoMotor {
  const texto = paginas.map((p) => reconstruirLinhas(p, tolY).join("\n")).join("\n");
  return processarTexto(texto, opcoes);
}

/**
 * Recalcula área, perímetros e fechamento a partir dos vértices do banco (E/N manda; decisão D3).
 * Se algum vértice tem `editado: true`, a divergência de distâncias é ignorada (lon/lat desatualizados).
 */
export function recalcularGeometria(
  vertices: Vertice[],
  opcoes: OpcoesMotor = {},
): { geometria: Geometria; avisos: Aviso[] } {
  const { limiteDivergenciaM = 0.1 } = opcoes;
  return calcularGeometria(vertices, limiteDivergenciaM, vertices.some((v) => v.editado));
}
