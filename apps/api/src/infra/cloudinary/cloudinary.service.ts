import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';

export type UploadKind = 'vendor-docs' | 'rider' | 'proof' | 'complaint' | 'catalog';

export interface SignedUpload {
  timestamp: number;
  signature: string;
  folder: string;
  upload_preset: string;
  api_key: string;
  cloud_name: string;
  type: 'upload' | 'authenticated';
}

/** Params signed by Cloudinary are sorted `k=v` pairs joined by `&`, with the secret appended, SHA-1. */
export function signParams(params: Record<string, string | number>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  return createHash('sha1').update(toSign + apiSecret).digest('hex');
}

/** Folder layout from TRD §15: dhoblio/{env}/... */
export function uploadFolder(env: string, kind: UploadKind, ownerId: string): string {
  const base = `dhoblio/${env}`;
  switch (kind) {
    case 'vendor-docs':
      return `${base}/vendors/${ownerId}/docs`;
    case 'rider':
      return `${base}/riders/${ownerId}`;
    case 'proof':
      return `${base}/proof/${ownerId}`;
    case 'complaint':
      return `${base}/complaints/${ownerId}`;
    case 'catalog':
      return `${base}/catalog/${ownerId}`;
  }
}

@Injectable()
export class CloudinaryService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private get cloudName() {
    return this.config.get('CLOUDINARY_CLOUD_NAME', { infer: true });
  }
  private get apiKey() {
    return this.config.get('CLOUDINARY_API_KEY', { infer: true });
  }
  private get apiSecret() {
    return this.config.get('CLOUDINARY_API_SECRET', { infer: true });
  }

  /**
   * Signature for a direct browser upload. Sensitive documents (CNIC) must pass `sensitive: true` so they are
   * stored as `authenticated` and never get a public URL (TRD §15).
   */
  signUpload(kind: UploadKind, ownerId: string, opts: { sensitive?: boolean } = {}): SignedUpload {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new AppException('MEDIA_NOT_CONFIGURED', 'Media uploads are not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = uploadFolder(this.config.get('NODE_ENV', { infer: true }), kind, ownerId);
    const upload_preset = this.config.get('CLOUDINARY_UPLOAD_PRESET', { infer: true });
    const type = opts.sensitive ? 'authenticated' : 'upload';
    const signature = signParams({ folder, timestamp, type, upload_preset }, this.apiSecret);
    return { timestamp, signature, folder, upload_preset, api_key: this.apiKey, cloud_name: this.cloudName, type };
  }

  /**
   * Confirms an uploaded asset really exists (and lives under the expected folder) via the Admin API before the
   * API persists its publicId. Returns the stored asset facts.
   */
  async verifyAsset(
    publicId: string,
    expectedFolderPrefix: string,
    type: 'upload' | 'authenticated' = 'upload',
  ): Promise<{ publicId: string; url: string; bytes: number; format: string }> {
    if (!publicId.startsWith(`${expectedFolderPrefix}/`)) {
      throw new AppException('MEDIA_INVALID_ASSET', 'Asset is outside the expected folder', HttpStatus.BAD_REQUEST);
    }
    const auth = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');
    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/resources/image/${type}/${encodeURI(publicId)}`;
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
    if (res.status === 404) {
      throw new AppException('MEDIA_INVALID_ASSET', 'Uploaded asset was not found', HttpStatus.BAD_REQUEST);
    }
    if (!res.ok) {
      throw new AppException('MEDIA_VERIFY_FAILED', 'Could not verify uploaded asset', HttpStatus.BAD_GATEWAY);
    }
    const body = (await res.json()) as { public_id: string; secure_url: string; bytes: number; format: string };
    return { publicId: body.public_id, url: body.secure_url, bytes: body.bytes, format: body.format };
  }
}
