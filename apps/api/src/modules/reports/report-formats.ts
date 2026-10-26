import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';

export type Cell = string | number | null;

export interface Column {
  header: string;
  /** Money columns are numbers with two decimals in a spreadsheet and plain `1250.00` text in CSV. */
  kind?: 'text' | 'money' | 'int';
}

export interface ReportWriter {
  /** Appends rows (each in column order). */
  write(rows: Cell[][]): Promise<void>;
  /** Finishes the file and returns it. */
  finish(): Promise<Buffer>;
}

/**
 * A spreadsheet treats a cell that starts with = + - @ (or a tab / carriage return) as a formula. Names and notes
 * come from users, so such text is prefixed with an apostrophe-style guard instead of being trusted.
 */
export function guardFormula(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: Cell, kind: Column['kind']): string {
  if (value === null || value === undefined) return '';
  const text = typeof value === 'number' ? (kind === 'money' ? value.toFixed(2) : String(value)) : guardFormula(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 with a byte-order mark (so Excel reads Urdu names correctly) and CRLF line ends. */
export class CsvWriter implements ReportWriter {
  private readonly chunks: Buffer[] = [];

  constructor(private readonly columns: Column[]) {
    this.chunks.push(Buffer.from('﻿'), Buffer.from(`${columns.map((c) => csvCell(c.header, 'text')).join(',')}\r\n`));
  }

  async write(rows: Cell[][]): Promise<void> {
    if (rows.length === 0) return;
    this.chunks.push(Buffer.from(rows.map((r) => `${r.map((v, i) => csvCell(v, this.columns[i]?.kind)).join(',')}\r\n`).join('')));
  }

  async finish(): Promise<Buffer> {
    return Buffer.concat(this.chunks);
  }
}

/** Streams rows into the workbook as they arrive, so a 100 000-row report does not build a second copy in memory. */
export class XlsxWriter implements ReportWriter {
  private readonly sink = new PassThrough();
  private readonly chunks: Buffer[] = [];
  private readonly sheet: ExcelJS.Worksheet;
  private readonly workbook: ExcelJS.stream.xlsx.WorkbookWriter;

  constructor(
    private readonly columns: Column[],
    sheetName: string,
  ) {
    this.sink.on('data', (c: Buffer) => this.chunks.push(c));
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: this.sink, useStyles: true, useSharedStrings: false });
    this.sheet = this.workbook.addWorksheet(sheetName.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    this.sheet.columns = columns.map((c) => ({
      header: c.header,
      width: Math.max(12, c.header.length + 2),
      style: c.kind === 'money' ? { numFmt: '#,##0.00' } : {},
    }));
    this.sheet.getRow(1).font = { bold: true };
  }

  async write(rows: Cell[][]): Promise<void> {
    for (const r of rows) {
      this.sheet.addRow(r.map((v) => (typeof v === 'string' ? guardFormula(v) : v))).commit();
    }
  }

  async finish(): Promise<Buffer> {
    this.sheet.commit();
    await this.workbook.commit();
    return Buffer.concat(this.chunks);
  }
}
