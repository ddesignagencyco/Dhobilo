'use client';

import { vendorApiClient } from '@/lib/api/client';

interface UploadSignature {
  timestamp: number;
  signature: string;
  folder: string;
  upload_preset: string;
  api_key: string;
  cloud_name: string;
  type: string;
  limits: { maxBytes: number; formats: string[] };
}

const MAX_EDGE = 1600;

/** Downscale to a sane size and re-encode as JPEG so a phone photo fits the 5 MB upload limit. */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('NOT_AN_IMAGE');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('COMPRESS_FAILED'))), 'image/jpeg', 0.82),
  );
}

export class UploadConfigError extends Error {}

/** Signs with the API, then uploads straight to Cloudinary. Returns the public id to send at registration. */
export async function uploadVendorDocument(file: File, onProgress?: (percent: number) => void): Promise<string> {
  let sig: UploadSignature;
  try {
    sig = (
      await vendorApiClient.post<UploadSignature>('/media/sign', {
        kind: 'vendor-docs',
      })
    ).data;
  } catch (error) {
    if ((error as { code?: string }).code === 'MEDIA_NOT_CONFIGURED')
      throw new UploadConfigError('MEDIA_NOT_CONFIGURED');
    throw error;
  }

  const blob = await compress(file);
  if (blob.size > sig.limits.maxBytes) throw new Error('TOO_LARGE');

  const form = new FormData();
  form.append('file', blob, 'upload.jpg');
  form.append('api_key', sig.api_key);
  form.append('timestamp', String(sig.timestamp));
  form.append('signature', sig.signature);
  form.append('upload_preset', sig.upload_preset);
  form.append('folder', sig.folder);
  form.append('type', sig.type);

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as { public_id?: string };
        if (xhr.status >= 200 && xhr.status < 300 && body.public_id) resolve(body.public_id);
        else reject(new Error('UPLOAD_FAILED'));
      } catch {
        reject(new Error('UPLOAD_FAILED'));
      }
    };
    xhr.onerror = () => reject(new Error('UPLOAD_FAILED'));
    xhr.send(form);
  });
}
