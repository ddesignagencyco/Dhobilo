import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { Column, CsvWriter, XlsxWriter, guardFormula } from './report-formats';
import { maskPhone } from './report-sources';

const columns: Column[] = [{ header: 'Name' }, { header: 'Note' }, { header: 'Amount', kind: 'money' }, { header: 'Count', kind: 'int' }];

describe('guardFormula', () => {
  it('neutralises text a spreadsheet would run', () => {
    for (const bad of ['=1+1', '+cmd', '-2+3', '@SUM(A1)', '\tx', '\rx']) expect(guardFormula(bad)).toBe(`'${bad}`);
  });

  it('leaves ordinary text alone', () => {
    for (const fine of ['Sparkle Laundry', 'a=b', '0300****567', '', 'DHB-LHR-000123', 'عید آفر']) expect(guardFormula(fine)).toBe(fine);
  });
});

describe('CsvWriter', () => {
  const run = async (rows: (string | number | null)[][]) => {
    const w = new CsvWriter(columns);
    await w.write(rows);
    return (await w.finish()).toString('utf8');
  };

  it('starts with a byte-order mark and a header, and ends every line with CRLF', async () => {
    const out = await run([['A', 'b', 1, 2]]);
    expect(out).toBe('﻿Name,Note,Amount,Count\r\nA,b,1.00,2\r\n');
  });

  it('quotes commas, quotes and line breaks, and keeps empty cells empty', async () => {
    const out = await run([['Ali, "the" laundry', 'two\nlines', null, 0]]);
    expect(out).toBe('﻿Name,Note,Amount,Count\r\n"Ali, ""the"" laundry","two\nlines",,0\r\n');
  });

  it('writes money with exactly two decimals and counts as integers', async () => {
    expect(await run([['x', 'y', 1250.5, 3], ['x', 'y', 0.1 + 0.2, 1]])).toContain('x,y,1250.50,3\r\nx,y,0.30,1\r\n');
  });

  it('guards formulas and keeps the Urdu', async () => {
    const out = await run([['=cmd|calc', 'عید', 5, 1]]);
    expect(out).toContain("'=cmd|calc,عید,5.00,1");
  });

  it('an empty report is just the header', async () => {
    expect(await run([])).toBe('﻿Name,Note,Amount,Count\r\n');
  });
});

describe('XlsxWriter', () => {
  it('writes a frozen, bold header and typed cells', async () => {
    const w = new XlsxWriter(columns, 'Orders');
    await w.write([['A', '=bad', 12.5, 3], ['B', null, 0, 0]]);
    const buffer = await w.finish();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const ws = wb.getWorksheet('Orders')!;
    expect(ws.rowCount).toBe(3);
    expect(ws.getRow(1).values).toEqual([undefined, 'Name', 'Note', 'Amount', 'Count']);
    expect(ws.getRow(1).font?.bold).toBe(true);
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.getRow(2).getCell(2).value).toBe("'=bad");
    expect(ws.getRow(2).getCell(3).value).toBe(12.5);
    expect(ws.getRow(2).getCell(3).numFmt).toBe('#,##0.00');
  });

  it('streams many rows into a readable workbook', async () => {
    const w = new XlsxWriter(columns, 'Orders');
    for (let i = 0; i < 5; i++) await w.write(Array.from({ length: 1000 }, (_, j) => [`n${i}-${j}`, 'x', j, i]));
    const reader = new ExcelJS.stream.xlsx.WorkbookReader(Readable.from(await w.finish()), {});
    let rows = 0;
    for await (const sheet of reader) for await (const _row of sheet as AsyncIterable<unknown>) rows++;
    expect(rows).toBe(5001);
  });
});

describe('maskPhone', () => {
  it('shows the first four and last three digits in the local form', () => {
    expect(maskPhone('+923001234567')).toBe('0300****567');
    expect(maskPhone('03001234567')).toBe('0300****567');
  });

  it('never leaks short numbers and tolerates missing ones', () => {
    expect(maskPhone('12345')).toBe('*****');
    expect(maskPhone(null)).toBeNull();
    expect(maskPhone('')).toBeNull();
  });
});
