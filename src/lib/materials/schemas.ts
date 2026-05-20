import { z } from 'zod';
import { MaterialType } from '@prisma/client';

/**
 * Two flavours of material creation:
 *   - FILE / PDF / SLIDES: caller already uploaded via /api/uploads/sign and
 *     passes the resulting fileId. We pull mimeType/sizeBytes from StoredFile.
 *   - LINK / VIDEO_EMBED: caller provides an external URL only.
 *
 * Modelled as a discriminated union for clean validation messages.
 */
export const createMaterialSchema = z.discriminatedUnion('source', [
  z.object({
    source: z.literal('upload'),
    title: z.string().min(1).max(200),
    fileId: z.string().cuid(),
    /// FILE | PDF | SLIDES — caller picks the semantic type.
    type: z.enum([MaterialType.FILE, MaterialType.PDF, MaterialType.SLIDES]),
  }),
  z.object({
    source: z.literal('link'),
    title: z.string().min(1).max(200),
    url: z.string().url().max(2048),
    type: z.enum([MaterialType.LINK, MaterialType.VIDEO_EMBED]),
  }),
]);

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
