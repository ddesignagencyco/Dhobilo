import { IsIn } from 'class-validator';

/**
 * What the upload is for. `vendor-docs` (vendor owners) are private CNIC and shop photos; `rider-photo` (riders)
 * is the profile photo customers see; `delivery-proof` (riders) is a private proof-of-delivery photo.
 */
export const UPLOAD_KINDS = ['vendor-docs', 'rider-photo', 'delivery-proof'] as const;
export type UploadKindDto = (typeof UPLOAD_KINDS)[number];

export class SignUploadDto {
  @IsIn(UPLOAD_KINDS)
  kind!: UploadKindDto;
}
