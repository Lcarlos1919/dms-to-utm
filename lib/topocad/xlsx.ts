import type { Crs, Vertice } from "./tipos";
import { criarZip } from "./zip";

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
