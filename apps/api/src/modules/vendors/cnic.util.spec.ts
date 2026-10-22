import { maskCnic, normalizeCnic } from './cnic.util';

describe('CNIC helpers', () => {
  it.each([
    ['35202-1234567-1', '3520212345671'],
    ['3520212345671', '3520212345671'],
    ['35202 1234567 1', '3520212345671'],
  ])('normalises %s', (input, expected) => expect(normalizeCnic(input)).toBe(expected));

  it.each(['', '123', '35202-1234567', '35202-1234567-12', 'abcde-fghijkl-m', '1111111111111', '0000000000000'])(
    'rejects %s',
    (input) => expect(normalizeCnic(input)).toBeNull(),
  );

  it('masks all but the last four digits', () => {
    expect(maskCnic('3520212345671')).toBe('*********5671');
  });
});
