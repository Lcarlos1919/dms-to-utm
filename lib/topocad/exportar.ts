/**
 * TopoCAD — exportação (arquivo 2 de 3): gerarXlsx e gerarDxf. Sem dependências.
 * Salve como lib/topocad/exportar.ts. Exporte sempre a partir dos vértices do banco.
 */

import type { Crs, Vertice } from "./motor";

// ───────────────────────── DXF R12 (ASCII, escrito à mão) ─────────────────────────

/** Camadas e cores (ACI) iguais às do script: PONTOS vermelho, LIMITE verde, CODIGOS branco/preto. */
const CAMADAS: [string, number][] = [
  ["0", 7],
  ["PONTOS", 1],
  ["LIMITE", 3],
  ["CODIGOS", 7],
];

function num(n: number): string {
  const s = n.toFixed(6).replace(/\.?0+$/, "");
  return s === "-0" || s === "" ? "0" : s;
}

/** DXF antigo é ASCII: caracteres fora de ASCII viram \U+XXXX (escape que o AutoCAD entende). */
function ascii(t: string): string {
  return t.replace(/[\r\n]+/g, " ").replace(/[^\x20-\x7e]/g, (c) => "\\U+" + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0"));
}

/**
 * Gera DXF ASCII no formato R12 (AC1009), o mais compatível: AutoCAD (desktop e Web), BricsCAD,
 * QGIS, LibreOffice. 1 POINT por vértice, 1 TEXT por vértice, 1 POLYLINE 2D fechada
 * (POLYLINE + VERTEX + SEQEND) na ordem do memorial. X = Este, Y = Norte.
 * Sem handles, sem BLOCKS e sem OBJECTS: o R12 não exige. A versão R2010 escrita à mão foi
 * recusada pelo AutoCAD Web ("Entrada DXF inválida ou incompleta"), por isso não é mais usada.
 * Escritor próprio e sem dependências. Unidade (metros) não é gravada: o R12 não tem $INSUNITS.
 */
export function gerarDxf(vertices: Pick<Vertice, "codigo" | "este" | "norte">[]): string {
  if (vertices.length === 0) throw new Error("gerarDxf: nenhum vértice");

  const out: string[] = [];
  const g = (codigo: number | string, valor: string | number) => {
    out.push(String(codigo), String(valor));
  };

  const xs = vertices.map((v) => v.este);
  const ys = vertices.map((v) => v.norte);
  const ext = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const alturaTxt = ext / 100 > 0 ? ext / 100 : 1;

  // HEADER
  g(0, "SECTION"); g(2, "HEADER");
  g(9, "$ACADVER"); g(1, "AC1009");
  g(9, "$PDMODE"); g(70, 35);
  g(9, "$PDSIZE"); g(40, -2);
  g(0, "ENDSEC");

  // TABLES
  g(0, "SECTION"); g(2, "TABLES");

  g(0, "TABLE"); g(2, "LTYPE"); g(70, 1);
  g(0, "LTYPE"); g(2, "CONTINUOUS"); g(70, 0); g(3, "Solid line"); g(72, 65); g(73, 0); g(40, 0);
  g(0, "ENDTAB");

  g(0, "TABLE"); g(2, "LAYER"); g(70, CAMADAS.length);
  for (const [nome, cor] of CAMADAS) {
    g(0, "LAYER"); g(2, nome); g(70, 0); g(62, cor); g(6, "CONTINUOUS");
  }
  g(0, "ENDTAB");

  g(0, "TABLE"); g(2, "STYLE"); g(70, 1);
  g(0, "STYLE"); g(2, "STANDARD"); g(70, 0); g(40, 0); g(41, 1); g(50, 0); g(71, 0); g(42, 0.2); g(3, "txt"); g(4, "");
  g(0, "ENDTAB");

  g(0, "ENDSEC");

  // ENTITIES
  g(0, "SECTION"); g(2, "ENTITIES");

  for (const v of vertices) {
    g(0, "POINT"); g(8, "PONTOS");
    g(10, num(v.este)); g(20, num(v.norte)); g(30, 0);
  }

  for (const v of vertices) {
    g(0, "TEXT"); g(8, "CODIGOS");
    g(10, num(v.este + alturaTxt / 2)); g(20, num(v.norte + alturaTxt / 2)); g(30, 0);
    g(40, num(alturaTxt)); g(1, ascii(v.codigo)); g(7, "STANDARD");
  }

  g(0, "POLYLINE"); g(8, "LIMITE"); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1);
  for (const v of vertices) {
    g(0, "VERTEX"); g(8, "LIMITE"); g(10, num(v.este)); g(20, num(v.norte)); g(30, 0);
  }
  g(0, "SEQEND"); g(8, "LIMITE");

  g(0, "ENDSEC");
  g(0, "EOF");
  return out.join("\r\n") + "\r\n";
}

// ───────────────────────── ZIP mínimo (stored) ─────────────────────────

/** ZIP mínimo (método "stored", sem compressão), suficiente para um .xlsx. */

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(dados: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function criarZip(arquivos: { nome: string; conteudo: string | Uint8Array }[]): Uint8Array {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let deslocamento = 0;

  // data/hora DOS fixas (1980-01-01 00:00) para saída determinística
  const hora = 0, data = 0x21;

  for (const a of arquivos) {
    const nome = enc.encode(a.nome);
    const dados = typeof a.conteudo === "string" ? enc.encode(a.conteudo) : a.conteudo;
    const crc = crc32(dados);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // nomes em UTF-8
    local.setUint16(8, 0, true);      // stored
    local.setUint16(10, hora, true);
    local.setUint16(12, data, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, dados.length, true);
    local.setUint32(22, dados.length, true);
    local.setUint16(26, nome.length, true);
    local.setUint16(28, 0, true);
    partes.push(new Uint8Array(local.buffer), nome, dados);

    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x0800, true);
    c.setUint16(10, 0, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, data, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, dados.length, true);
    c.setUint32(24, dados.length, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, deslocamento, true);
    central.push(new Uint8Array(c.buffer), nome);

    deslocamento += 30 + nome.length + dados.length;
  }

  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true);
  fim.setUint16(8, arquivos.length, true);
  fim.setUint16(10, arquivos.length, true);
  fim.setUint32(12, tamCentral, true);
  fim.setUint32(16, deslocamento, true);

  const todas = [...partes, ...central, new Uint8Array(fim.buffer)];
  const saida = new Uint8Array(todas.reduce((s, p) => s + p.length, 0));
  let pos = 0;
  for (const p of todas) { saida.set(p, pos); pos += p.length; }
  return saida;
}

// ───────────────────────── XLSX (2 abas, números reais) ─────────────────────────

export type LinhaInfo = [string, string | number];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const col = (i: number) => String.fromCharCode(65 + i);

type Celula = { v: string | number | null; s: number };

function celulaXml(ref: string, c: Celula): string {
  if (c.v === null) return "";
  if (typeof c.v === "number") return `<c r="${ref}" s="${c.s}"><v>${c.v}</v></c>`;
  return `<c r="${ref}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
}

function planilhaXml(linhas: Celula[][], larguras?: number[]): string {
  const cols = larguras
    ? `<cols>${larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = linhas
    .map((l, r) => `<row r="${r + 1}">${l.map((c, i) => celulaXml(`${col(i)}${r + 1}`, c)).join("")}</row>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

// estilos: 0 padrão | 1 cabeçalho negrito | 2 texto (@) | 3 0.000 | 4 0.00 | 5 0.00000000
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="0.00000000"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="6">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

/**
 * Gera o .xlsx (2 abas: "Vértices" e "Info") igual ao do script Python.
 * Células numéricas de verdade; o formato só controla a exibição.
 * `extras` são linhas adicionais da aba Info (ex.: Projeto, Área (m²)).
 */
export function gerarXlsx(vertices: Vertice[], crs: Crs, extras: LinhaInfo[] = []): Uint8Array {
  const cab = ["Ponto", "Este - X (m)", "Norte - Y (m)", "Altitude (m)", "Longitude", "Latitude"];
  const linhasV: Celula[][] = [cab.map((t) => ({ v: t, s: 1 }))];
  for (const v of vertices) {
    linhasV.push([
      { v: v.codigo, s: 2 },
      { v: v.este, s: 3 },
      { v: v.norte, s: 3 },
      { v: v.altitude, s: 4 },
      { v: v.lon, s: 5 },
      { v: v.lat, s: 5 },
    ]);
  }

  const info: LinhaInfo[] = [["Sistema", crs.nome], ["Fuso", `${crs.fuso}${crs.hemisferio}`], ["EPSG", crs.epsg], ...extras];
  const linhasI: Celula[][] = info.map(([k, val]) => [{ v: k, s: 0 }, { v: val, s: 0 }]);

  const ct = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const wb = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Vértices" sheetId="1" r:id="rId1"/><sheet name="Info" sheetId="2" r:id="rId2"/></sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

  return criarZip([
    { nome: "[Content_Types].xml", conteudo: ct },
    { nome: "_rels/.rels", conteudo: rels },
    { nome: "xl/workbook.xml", conteudo: wb },
    { nome: "xl/_rels/workbook.xml.rels", conteudo: wbRels },
    { nome: "xl/styles.xml", conteudo: STYLES },
    { nome: "xl/worksheets/sheet1.xml", conteudo: planilhaXml(linhasV, [16, 16, 16, 14, 16, 16]) },
    { nome: "xl/worksheets/sheet2.xml", conteudo: planilhaXml(linhasI) },
  ]);
}
