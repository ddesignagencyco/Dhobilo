import { IsIn } from 'class-validator';

/** What the upload is for. Only vendor verification documents exist so far. */
export const UPLOAD_KINDS = ['vendor-docs'] as const;

export class SignUploadDto {
  @IsIn(UPLOAD_KINDS)
  kind!: (typeof UPLOAD_KINDS)[number];
}
