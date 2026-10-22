import { FieldCrypto, parseKeyList } from './field-crypto';

const key = (n: number) => Buffer.alloc(32, n);
const hmac = Buffer.alloc(32, 99);

describe('FieldCrypto', () => {
  const crypto = new FieldCrypto({ currentId: 'k1', keys: { k1: key(1) } }, hmac);

  it('round-trips and never repeats a ciphertext for the same input', () => {
    const a = crypto.encrypt('3520212345671', 'vendor.cnic');
    const b = crypto.encrypt('3520212345671', 'vendor.cnic');
    expect(a).not.toBe(b);
    expect(a.startsWith('k1.')).toBe(true);
    expect(a).not.toContain('3520212345671');
    expect(crypto.decrypt(a, 'vendor.cnic')).toBe('3520212345671');
  });

  it('refuses a ciphertext moved into a different field (AAD binding)', () => {
    const token = crypto.encrypt('3520212345671', 'vendor.cnic');
    expect(() => crypto.decrypt(token, 'rider.cnic')).toThrow();
  });

  it('detects tampering', () => {
    const [id, iv, tag, ct] = crypto.encrypt('secret', 'ctx').split('.');
    const flipped = Buffer.from(ct, 'base64url');
    flipped[0] ^= 1;
    expect(() => crypto.decrypt([id, iv, tag, flipped.toString('base64url')].join('.'), 'ctx')).toThrow();
    expect(() => crypto.decrypt('garbage', 'ctx')).toThrow(/Malformed/);
  });

  describe('key rotation', () => {
    const oldKeyCrypto = new FieldCrypto({ currentId: 'k1', keys: { k1: key(1) } }, hmac);
    const rotated = new FieldCrypto({ currentId: 'k2', keys: { k1: key(1), k2: key(2) } }, hmac);

    it('reads data written with the previous key and flags it for re-encryption', () => {
      const legacy = oldKeyCrypto.encrypt('3520212345671', 'vendor.cnic');
      expect(rotated.decrypt(legacy, 'vendor.cnic')).toBe('3520212345671');
      expect(rotated.needsRotation(legacy)).toBe(true);
    });

    it('writes new data with the new key', () => {
      const fresh = rotated.encrypt('x', 'ctx');
      expect(fresh.startsWith('k2.')).toBe(true);
      expect(rotated.needsRotation(fresh)).toBe(false);
    });

    it('cannot read data once its key is dropped from the ring', () => {
      const legacy = oldKeyCrypto.encrypt('x', 'ctx');
      const dropped = new FieldCrypto({ currentId: 'k2', keys: { k2: key(2) } }, hmac);
      expect(() => dropped.decrypt(legacy, 'ctx')).toThrow(/Unknown encryption key/);
    });
  });

  it('rejects a ring whose current key is missing or has a bad id', () => {
    expect(() => new FieldCrypto({ currentId: 'k9', keys: { k1: key(1) } }, hmac)).toThrow();
    expect(() => new FieldCrypto({ currentId: 'a.b', keys: { 'a.b': key(1) } }, hmac)).toThrow();
  });

  describe('hash', () => {
    it('is deterministic, keyed and namespaced', () => {
      expect(crypto.hash('cnic', '123')).toBe(crypto.hash('cnic', '123'));
      expect(crypto.hash('cnic', '123')).not.toBe(crypto.hash('rider-cnic', '123'));
      const other = new FieldCrypto({ currentId: 'k1', keys: { k1: key(1) } }, Buffer.alloc(32, 5));
      expect(other.hash('cnic', '123')).not.toBe(crypto.hash('cnic', '123'));
    });
  });
});

describe('parseKeyList', () => {
  it('parses id=base64 pairs', () => {
    const keys = parseKeyList(`k0=${key(7).toString('base64')}, k-1=${key(8).toString('base64')}`);
    expect(Object.keys(keys)).toEqual(['k0', 'k-1']);
  });

  it('returns nothing for empty input and rejects bad entries', () => {
    expect(parseKeyList(undefined)).toEqual({});
    expect(parseKeyList('  ')).toEqual({});
    expect(() => parseKeyList('k0=short')).toThrow(/32 bytes/);
    expect(() => parseKeyList('nokey')).toThrow(/Invalid key entry/);
    expect(() => parseKeyList(`bad.id=${key(1).toString('base64')}`)).toThrow(/Invalid key entry/);
  });
});
