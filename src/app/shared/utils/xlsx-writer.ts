/**
 * A small, dependency-free writer for genuine Excel workbooks (.xlsx = Office Open XML in a zip), enough for reports:
 * several sheets, text / number / date cells, a fixed set of styles (bold, title, header band, PHP currency, date,
 * totals), column widths, a frozen header row and an auto-filter. Opens in Excel, Apple Numbers and Google Sheets.
 *
 * Strings are written inline (`t="inlineStr"`), so there is no shared-strings part; the zip is stored uncompressed.
 */

/** Cell styles, indexes into `cellXfs` in STYLES_XML below. */
export const XLSX_STYLE = {
  normal: 0,
  bold: 1,
  title: 2,
  header: 3,
  currency: 4,
  date: 5,
  totalLabel: 6,
  totalCurrency: 7,
  totalNumber: 8,
  muted: 9,
} as const;
export type XlsxStyle = (typeof XLSX_STYLE)[keyof typeof XLSX_STYLE];

export type XlsxValue = string | number | Date | null;
export interface XlsxCell {
  value: XlsxValue;
  style?: XlsxStyle;
}
export type XlsxRow = (XlsxValue | XlsxCell)[];

export interface XlsxSheet {
  /** ≤ 31 characters, no `[]:*?/\`. */
  name: string;
  rows: XlsxRow[];
  /** Column widths in characters, from column A. */
  widths?: number[];
  /** Freeze the first row (a header) while scrolling. */
  freezeHeader?: boolean;
  /** Put Excel's filter buttons on this row (1-based) over all used columns. */
  autoFilterRow?: number;
}

// ── XML parts ────────────────────────────────────────────────────────────────

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const XML_HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

const STYLES_XML =
  XML_HEAD +
  `<styleSheet xmlns="${MAIN_NS}">` +
  '<numFmts count="2">' +
  '<numFmt numFmtId="164" formatCode="&quot;₱&quot;#,##0.00"/>' +
  '<numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/>' +
  '</numFmts>' +
  '<fonts count="4">' +
  '<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font>' +
  '<font><sz val="10"/><color rgb="FF8C8C8C"/><name val="Calibri"/><family val="2"/></font>' +
  '</fonts>' +
  '<fills count="4">' +
  '<fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F5F5"/><bgColor indexed="64"/></patternFill></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E6"/><bgColor indexed="64"/></patternFill></fill>' +
  '</fills>' +
  '<borders count="3">' +
  '<border><left/><right/><top/><bottom/><diagonal/></border>' +
  '<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>' +
  '<border><left/><right/><top style="thin"><color rgb="FF1A1A1A"/></top><bottom/><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="10">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="0" fontId="1" fillId="3" borderId="2" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="164" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="1" fontId="1" fillId="3" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>' +
  '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

function escapeXml(text: string): string {
  return (
    text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      // Control characters aren't allowed in XML 1.0.
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  );
}

/** 0 → A, 25 → Z, 26 → AA. */
function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

/** Excel's date serial for a local date and time (days since 1899-12-30). */
function excelDate(date: Date): number {
  const asUtc = Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
    date.getSeconds(),
  );
  return asUtc / 86_400_000 + 25_569;
}

function cellXml(ref: string, raw: XlsxValue | XlsxCell): string {
  const cell: XlsxCell =
    raw !== null && typeof raw === 'object' && !(raw instanceof Date) ? raw : { value: raw };
  const { value } = cell;
  const style = cell.style ?? (value instanceof Date ? XLSX_STYLE.date : XLSX_STYLE.normal);
  const s = style ? ` s="${style}"` : '';
  if (value === null || value === '') return style ? `<c r="${ref}"${s}/>` : '';
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : `<c r="${ref}"${s}><v>${excelDate(value)}</v></c>`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : '';
  }
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function sheetXml(sheet: XlsxSheet): string {
  const width = Math.max(1, ...sheet.rows.map((row) => row.length));
  const views = sheet.freezeHeader
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : '';
  const rows = sheet.rows
    .map((row, r) => {
      const cells = row.map((value, c) => cellXml(`${columnName(c)}${r + 1}`, value)).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  const filter = sheet.autoFilterRow
    ? `<autoFilter ref="A${sheet.autoFilterRow}:${columnName(width - 1)}${Math.max(sheet.autoFilterRow, sheet.rows.length)}"/>`
    : '';
  return (
    XML_HEAD +
    `<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
    views +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    cols +
    `<sheetData>${rows}</sheetData>` +
    filter +
    '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    '</worksheet>'
  );
}

function workbookParts(sheets: XlsxSheet[]): Record<string, string> {
  const names = sheets.map((s) => s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31));
  const filters = sheets
    .map((sheet, i) =>
      sheet.autoFilterRow
        ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${names[i].replace(/'/g, "''")}'!$A$${sheet.autoFilterRow}:$${columnName(
            Math.max(1, ...sheet.rows.map((row) => row.length)) - 1,
          )}$${Math.max(sheet.autoFilterRow, sheet.rows.length)}</definedName>`
        : '',
    )
    .join('');
  const parts: Record<string, string> = {
    '[Content_Types].xml':
      XML_HEAD +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      sheets
        .map(
          (_, i) =>
            `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join('') +
      '</Types>',
    '_rels/.rels':
      XML_HEAD +
      `<Relationships xmlns="${PKG_REL_NS}">` +
      `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
      '</Relationships>',
    'xl/workbook.xml':
      XML_HEAD +
      `<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}">` +
      '<bookViews><workbookView/></bookViews>' +
      `<sheets>${names
        .map(
          (name, i) => `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join('')}</sheets>` +
      (filters ? `<definedNames>${filters}</definedNames>` : '') +
      '</workbook>',
    'xl/_rels/workbook.xml.rels':
      XML_HEAD +
      `<Relationships xmlns="${PKG_REL_NS}">` +
      sheets
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join('') +
      `<Relationship Id="rId${sheets.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>` +
      '</Relationships>',
    'xl/styles.xml': STYLES_XML,
  };
  sheets.forEach((sheet, i) => (parts[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet)));
  return parts;
}

// ── Zip (stored, no compression) ─────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(files: Record<string, string>, when = new Date()): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const time = (when.getHours() << 11) | (when.getMinutes() << 5) | (when.getSeconds() >> 1);
  const date = ((when.getFullYear() - 1980) << 9) | ((when.getMonth() + 1) << 5) | when.getDate();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // UTF-8 names
    local.setUint16(8, 0, true); // stored
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(4, 20, true);
    entry.setUint16(6, 20, true);
    entry.setUint16(8, 0x0800, true);
    entry.setUint16(10, 0, true);
    entry.setUint16(12, time, true);
    entry.setUint16(14, date, true);
    entry.setUint32(16, crc, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, data.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);

  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of all) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** The workbook's bytes; save them with the `XLSX_MIME` type and a `.xlsx` name. */
export function buildXlsx(sheets: XlsxSheet[], when = new Date()): Uint8Array<ArrayBuffer> {
  return zip(workbookParts(sheets), when);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
