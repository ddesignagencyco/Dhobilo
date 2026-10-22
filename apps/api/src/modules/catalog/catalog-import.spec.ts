import { coerceCsvRow, extractImportRows, validateImportRows } from './catalog-import';

const CSV = `itemName,itemNameUr,category,serviceType,price,turnaroundHours,isActive
Shirt,قمیض,Wash & Iron,WASH_IRON,150,48,
"Suit, 2-piece",,Dry Cleaning,DRY_CLEAN,1200.50,72,false`;

describe('catalog import parsing', () => {
  it('turns CSV text into typed rows', () => {
    const rows = extractImportRows(CSV, true);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ itemName: 'Shirt', price: 150, turnaroundHours: 48, itemNameUr: 'قمیض' });
    expect(rows[0]).not.toHaveProperty('isActive');
    expect(rows[1]).toMatchObject({ itemName: 'Suit, 2-piece', price: 1200.5, isActive: false });
    expect(rows[1]).not.toHaveProperty('itemNameUr');
  });

  it('accepts a JSON body with items', () => {
    expect(extractImportRows({ items: [{ itemName: 'x' }] }, false)).toEqual([{ itemName: 'x' }]);
  });

  it.each([
    [{}, false],
    [{ items: 'nope' }, false],
    [{ items: [] }, false],
    ['', true],
    ['a,b\n"oops', true],
    [{ items: Array.from({ length: 501 }, () => ({})) }, false],
  ])('rejects bad input %j', (body, csv) => {
    expect(() => extractImportRows(body, csv)).toThrow();
  });

  it('keeps non-numeric text so validation can flag it', () => {
    expect(coerceCsvRow({ price: 'abc' }).price).toBeNaN();
  });
});

describe('validateImportRows', () => {
  const ok = { itemName: 'Shirt', category: 'Wash & Iron', serviceType: 'WASH_IRON', price: 150, turnaroundHours: 48 };

  it('accepts valid rows', async () => {
    const { items, errors } = await validateImportRows([ok]);
    expect(errors).toEqual([]);
    expect(items[0].itemName).toBe('Shirt');
  });

  it('reports every problem with its row number', async () => {
    const { errors } = await validateImportRows([
      ok,
      { ...ok, price: 0 },
      { ...ok, serviceType: 'NOPE' },
      { ...ok, price: 10.123 },
      { ...ok, turnaroundHours: 0 },
      { ...ok, vendorId: 'hack' },
      null as never,
    ]);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6, 7]);
  });
});
