import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

export interface KeyRing {
  /** Id of the key used for new encryptions. */
  currentId: string;
  /** Every key that may appear in stored ciphertext, including the current one. */
  keys: Record<string, Buffer>;
}

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/** Parses "k0=<base64>,k-1=<base64>" (ENC_PREVIOUS_KEYS) into id -> 32-byte key. */
export function parseKeyList(list: string | undefined): Record<string, Buffer> {
  const keys: Record<string, Buffer> = {};
  if (!list?.trim()) return keys;
  for (const entry of list.split(',')) {
    const [id, b64] = entry.trim().split('=');
    if (!id || !b64 || !KEY_ID_PATTERN.test(id)) throw new Error(`Invalid key entry "${entry}"`);
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) throw new Error(`Key "${id}" must be 32 bytes, base64-encoded`);
    keys[id] = key;
  }
  return keys;
}

const b64u = (b: Buffer) => b.toString('base64url');

/**
 * Field-level AES-256-GCM (TRD §7) with a key id in every ciphertext so keys can be rotated:
 * new data uses the current key, old data stays readable with the previous keys until re-encrypted.
 * `context` is bound as AAD, so a ciphertext copied into a different field fails to decrypt.
 * Format: `<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts).
 */
export class FieldCrypto {
  constructor(
    private readonly ring: KeyRing,
    private readonly hmacKey: Buffer,
  ) {
    if (!KEY_ID_PATTERN.test(ring.currentId)) throw new Error('Key id may only contain letters, digits, _ and -');
    if (!ring.keys[ring.currentId]) throw new Error(`Current key "${ring.currentId}" is missing from the key ring`);
  }

  encrypt(plaintext: string, context: string): string {
    const key = this.ring.keys[this.ring.currentId];
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [this.ring.currentId, b64u(iv), b64u(cipher.getAuthTag()), b64u(ciphertext)].join('.');
  }

  decrypt(token: string, context: string): string {
    const parts = token.split('.');
    if (parts.length !== 4) throw new Error('Malformed ciphertext');
    const [keyId, iv, tag, ciphertext] = parts;
    const key = this.ring.keys[keyId];
    if (!key) throw new Error(`Unknown encryption key id "${keyId}"`);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64url')), decipher.final()]).toString('utf8');
  }

  /** True when the ciphertext was written with an older key and should be re-encrypted. */
  needsRotation(token: string): boolean {
    return token.split('.')[0] !== this.ring.currentId;
  }

  /** Keyed, deterministic hash for uniqueness checks without decrypting (separate key from encryption). */
  hash(namespace: string, value: string): string {
    return createHmac('sha256', this.hmacKey).update(`${namespace}:${value}`).digest('hex');
  }
}
