export interface CsvParseResult {
  headers: string[]
  rows: { line: number; values: Record<string, string> }[]
  errors: { line: number; message: string }[]
}

/** Detects `,` vs `;` (common in Vietnamese Excel exports) from the header line. */
function detectDelimiter(text: string): ',' | ';' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  let inQuotes = false
  let commas = 0
  let semis = 0
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes
    else if (!inQuotes && ch === ',') commas++
    else if (!inQuotes && ch === ';') semis++
  }
  return semis > commas ? ';' : ','
}

/**
 * RFC 4180 CSV parser: quoted fields, escaped quotes, embedded commas and
 * newlines, CRLF/LF, optional UTF-8 BOM. Never splits lines on commas.
 */
export function parseCsv(input: string): CsvParseResult {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input
  const delimiter = detectDelimiter(text)
  const records: { line: number; cells: string[] }[] = []
  const errors: { line: number; message: string }[] = []

  let cells: string[] = []
  let cell = ''
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let afterQuote = false
  let sawContent = false

  const endCell = () => {
    cells.push(cell)
    cell = ''
    afterQuote = false
  }
  const endRecord = () => {
    endCell()
    if (!(cells.length === 1 && cells[0] === '' && !sawContent)) records.push({ line: recordLine, cells })
    cells = []
    sawContent = false
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          inQuotes = false
          afterQuote = true
        }
      } else {
        if (ch === '\n') line++
        cell += ch
      }
      continue
    }
    if (ch === '"' && cell === '' && !afterQuote) {
      inQuotes = true
      sawContent = true
    } else if (ch === delimiter) {
      sawContent = true
      endCell()
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      endRecord()
      line++
      recordLine = line
    } else {
      if (afterQuote) errors.push({ line, message: 'Ký tự lạ sau dấu nháy đóng' })
      cell += ch
      sawContent = true
    }
  }
  if (inQuotes) errors.push({ line: recordLine, message: 'Thiếu dấu nháy đóng ở cuối file' })
  if (cell !== '' || cells.length > 0 || sawContent) endRecord()

  if (records.length === 0) return { headers: [], rows: [], errors: [...errors, { line: 1, message: 'File CSV trống' }] }
  const headers = records[0].cells.map((h) => h.trim())
  const rows: CsvParseResult['rows'] = []
  for (const rec of records.slice(1)) {
    if (rec.cells.length !== headers.length) {
      errors.push({ line: rec.line, message: `Số cột (${rec.cells.length}) không khớp header (${headers.length})` })
      continue
    }
    const values: Record<string, string> = {}
    headers.forEach((h, i) => {
      values[h] = rec.cells[i]
    })
    rows.push({ line: rec.line, values })
  }
  return { headers, rows, errors }
}

/** Serialises rows to CSV with correct quoting (used for templates and error reports). */
export function toCsv(headers: string[], rows: string[][]): string {
  const esc = (v: string) => (/[",\r\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  return '﻿' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}
