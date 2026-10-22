import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService, assertAssetAllowed, assertPublicIdInFolder, signParams, uploadFolder } from './cloudinary.service';

function service(values: Record<string, string>) {
  return new CloudinaryService({ get: (k: string) => values[k] } as unknown as ConfigService<any, true>);
}

describe('signParams', () => {
  it('signs alphabetically sorted k=v pairs joined by & with the secret appended (sha1)', () => {
    const expected = createHash('sha1')
      .update('eager=w_400,h_300,c_pad|w_260,h_200,c_crop&public_id=sample&timestamp=1315060510abcd')
      .digest('hex');
    const sig = signParams({ timestamp: 1315060510, public_id: 'sample', eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' }, 'abcd');
    expect(sig).toBe(expected);
  });
});

describe('uploadFolder', () => {
  it('follows the TRD folder layout', () => {
    expect(uploadFolder('staging', 'vendor-docs', 'v1')).toBe('dhoblio/staging/vendors/v1/docs');
    expect(uploadFolder('staging', 'proof', 'o1')).toBe('dhoblio/staging/proof/o1');
  });
});

describe('assertPublicIdInFolder (shared Cloudinary account safety)', () => {
  const folder = 'dhoblio/production/vendors/u1/docs';

  it('accepts plain paths under the folder', () => {
    expect(() => assertPublicIdInFolder(`${folder}/front`, folder)).not.toThrow();
    expect(() => assertPublicIdInFolder(`${folder}/sub/front_abc123`, folder)).not.toThrow();
  });

  it.each([
    ['another app', 'caresaath/secret'],
    ['a sibling folder', 'dhoblio/production/vendors/u2/docs/front'],
    ['a prefix lookalike', 'dhoblio/production/vendors/u1/docs-evil/front'],
    ['the folder itself', folder],
    ['dot-dot traversal', `${folder}/../../../../../caresaath/secret`],
    ['a dot segment', `${folder}/./front`],
    ['empty segments', `${folder}//front`],
    ['a trailing slash', `${folder}/front/`],
    ['a backslash', `${folder}/..\\caresaath`],
    ['a control character', `${folder}/fr\u0000ont`],
  ])('rejects %s', (_label, id) => {
    expect(() => assertPublicIdInFolder(id, folder)).toThrow(/outside the expected folder/);
  });
});

describe('assertAssetAllowed', () => {
  it('accepts jpg/jpeg/png/webp up to 5 MB', () => {
    for (const format of ['jpg', 'JPEG', 'png', 'webp']) expect(() => assertAssetAllowed({ format, bytes: 5 * 1024 * 1024 })).not.toThrow();
  });

  it('rejects other formats and oversized files', () => {
    for (const format of ['pdf', 'gif', 'svg', 'exe']) expect(() => assertAssetAllowed({ format, bytes: 10 })).toThrow(/JPG, PNG or WebP/);
    expect(() => assertAssetAllowed({ format: 'jpg', bytes: 5 * 1024 * 1024 + 1 })).toThrow(/larger than 5 MB/);
  });
});

describe('CloudinaryService', () => {
  const cfg = {
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
    CLOUDINARY_UPLOAD_PRESET: 'preset',
    NODE_ENV: 'development',
  };

  it('stores sensitive documents as authenticated', () => {
    const s = service(cfg).signUpload('vendor-docs', 'v1', { sensitive: true });
    expect(s.type).toBe('authenticated');
    expect(s.folder).toBe('dhoblio/development/vendors/v1/docs');
    expect(s.signature).toBe(
      signParams({ folder: s.folder, timestamp: s.timestamp, type: 'authenticated', upload_preset: 'preset' }, 'secret'),
    );
  });

  it('builds an expiring, signed private download URL', () => {
    const url = new URL(service(cfg).privateDownloadUrl('dhoblio/x/doc1', 'jpg', 600));
    expect(url.origin + url.pathname).toBe('https://api.cloudinary.com/v1_1/demo/image/download');
    const q = Object.fromEntries(url.searchParams);
    expect(q).toMatchObject({ public_id: 'dhoblio/x/doc1', format: 'jpg', type: 'authenticated', api_key: 'key' });
    expect(Number(q.expires_at) - Number(q.timestamp)).toBe(600);
    const { api_key, signature, ...signed } = q;
    expect(signature).toBe(signParams(signed, 'secret'));
  });

  it('refuses to sign when Cloudinary is not configured', () => {
    expect(() => service({ ...cfg, CLOUDINARY_API_SECRET: '' }).signUpload('catalog', 'v1')).toThrow(/not configured/);
  });

  it('rejects assets outside the expected folder without calling the network', async () => {
    await expect(service(cfg).verifyAsset('other/place/x', 'dhoblio/development/vendors/v1')).rejects.toThrow(/outside/);
  });
});
