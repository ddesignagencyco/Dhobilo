import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception';
import type { Env } from '../../config/env';

/** Everything Dhoblio stores lives under this root (CLOUDINARY_FOLDER_ROOT), then `<env>/...`. */
export const DEFAULT_FOLDER_ROOT = 'dhoblio';

export type UploadKind = 'vendor-docs' | 'rider' | 'proof' | 'complaint' | 'catalog';

/** Enforced by the Cloudinary upload preset; echoed to clients so they can pre-check files (TRD §15). */
export const MEDIA_LIMITS = { maxBytes: 5 * 1024 * 1024, formats: ['jpg', 'png', 'webp'] } as const;

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
export function uploadFolder(env: string, kind: UploadKind, ownerId: string, root = DEFAULT_FOLDER_ROOT): string {
  const base = `${root}/${env}`;
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

  /** Public so other services build folders from the same root. Falls back to the default when unset. */
  get folderRoot(): string {
    return this.config.get('CLOUDINARY_FOLDER_ROOT', { infer: true }) || DEFAULT_FOLDER_ROOT;
  }

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
    const folder = uploadFolder(this.config.get('NODE_ENV', { infer: true }), kind, ownerId, this.folderRoot);
    const upload_preset = this.config.get('CLOUDINARY_UPLOAD_PRESET', { infer: true });
    const type = opts.sensitive ? 'authenticated' : 'upload';
    const signature = signParams({ folder, timestamp, type, upload_preset }, this.apiSecret);
    return { timestamp, signature, folder, upload_preset, api_key: this.apiKey, cloud_name: this.cloudName, type };
  }

  /**
   * Short-lived signed download link for an `authenticated` asset (CNIC and shop documents are never public).
   * Built with Cloudinary's signed private-download API; the link stops working after `ttlSec`.
   * NOTE: signing follows Cloudinary's documented scheme but has not been exercised against a live account yet.
   */
  privateDownloadUrl(publicId: string, format: string, ttlSec = 600): string {
    if (!this.cloudName || !this.apiKey || !this.apiSecret) {
      throw new AppException('MEDIA_NOT_CONFIGURED', 'Media uploads are not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const now = Math.floor(Date.now() / 1000);
    const params = { expires_at: now + ttlSec, format, public_id: publicId, timestamp: now, type: 'authenticated' };
    const signature = signParams(params, this.apiSecret);
    const query = new URLSearchParams({
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
      api_key: this.apiKey,
      signature,
    });
    return `https://api.cloudinary.com/v1_1/${this.cloudName}/image/download?${query.toString()}`;
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
    assertPublicIdInFolder(publicId, expectedFolderPrefix);
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
    // Trust what Cloudinary says it resolved, not what we asked for: it must still be inside the caller's folder.
    assertPublicIdInFolder(body.public_id, expectedFolderPrefix);
    assertAssetAllowed(body);
    return { publicId: body.public_id, url: body.secure_url, bytes: body.bytes, format: body.format };
  }
}

/**
 * The account may be shared with other apps, so a public id must be a plain path under our folder:
 * no `..`, empty segments, backslashes or control characters that could resolve to someone else's asset.
 */
export function assertPublicIdInFolder(publicId: string, folderPrefix: string): void {
  const invalid = () => new AppException('MEDIA_INVALID_ASSET', 'Asset is outside the expected folder', HttpStatus.BAD_REQUEST);
  if (!publicId.startsWith(`${folderPrefix}/`)) throw invalid();
  const rest = publicId.slice(folderPrefix.length + 1);
  if (!rest || /[\\\u0000-\u001f]/.test(rest) || rest.split('/').some((seg) => seg === '' || seg === '.' || seg === '..')) {
    throw invalid();
  }
}

/** Cloudinary presets can't cap file size, so the API enforces the limits (TRD §15) after upload. */
export function assertAssetAllowed(asset: { bytes: number; format: string }): void {
  const format = asset.format.toLowerCase() === 'jpeg' ? 'jpg' : asset.format.toLowerCase();
  if (!(MEDIA_LIMITS.formats as readonly string[]).includes(format)) {
    throw new AppException('MEDIA_INVALID_ASSET', 'Only JPG, PNG or WebP images are accepted', HttpStatus.BAD_REQUEST);
  }
  if (asset.bytes > MEDIA_LIMITS.maxBytes) {
    throw new AppException('MEDIA_INVALID_ASSET', 'The file is larger than 5 MB', HttpStatus.BAD_REQUEST);
  }
}
