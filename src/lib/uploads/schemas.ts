import { z } from 'zod';

export const signUploadSchema = z.object({
  /// File name as the user picked it (used to derive the S3 key + Content-Disposition).
  originalName: z.string().min(1).max(255),
  /// Browser-reported MIME type. Validated server-side against the kind's whitelist.
  contentType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  kind: z.enum(['file', 'image', 'video', 'avatar']),
});

export type SignUploadInput = z.infer<typeof signUploadSchema>;
