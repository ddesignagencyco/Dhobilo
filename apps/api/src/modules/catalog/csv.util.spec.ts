import { csvToRecords, parseCsv } from './csv.util';

describe('parseCsv', () => {
  it('parses simple rows with LF and CRLF endings and a trailing newline', () => {
    expect(parseCsv('a,b\n1,2\r\n3,4\n')).toEqual([['a', 'b'], ['1', '2'], ['3', '4']]);
  });

  it('handles quotes, escaped quotes, commas and newlines inside fields', () => {
    expect(parseCsv('name,note\n"Shirt, men","He said ""hi""\nthere"\n')).toEqual([
      ['name', 'note'],
      ['Shirt, men', 'He said "hi"\nthere'],
    ]);
  });

  it('skips blank lines, strips a BOM, keeps empty cells and Urdu text', () => {
    expect(parseCsv('﻿a,b,c\n\n1,,3\nقمیض,x,y')).toEqual([['a', 'b', 'c'], ['1', '', '3'], ['قمیض', 'x', 'y']]);
  });

  it('rejects an unterminated quote', () => {
    expect(() => parseCsv('a\n"oops')).toThrow(/Unterminated/);
  });
});

describe('csvToRecords', () => {
  it('maps rows to header-keyed objects with trimmed values and pads short rows', () => {
    expect(csvToRecords('itemName, price\n Shirt , 150 \nTrouser')).toEqual([
      { itemName: 'Shirt', price: '150' },
      { itemName: 'Trouser', price: '' },
    ]);
  });

  it('returns nothing for empty input', () => {
    expect(csvToRecords('')).toEqual([]);
  });
});
