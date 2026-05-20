import { z } from 'zod';

export const sendMessageSchema = z.object({
  body: z.string().min(1).max(4_000),
  fileId: z.string().cuid().optional(),
});

export const createDirectSchema = z.object({
  otherUserId: z.string().cuid(),
});

export const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  memberIds: z.array(z.string().cuid()).min(1).max(50),
});

export const markReadSchema = z.object({
  messageId: z.string().cuid(),
});

export const listMessagesQuerySchema = z.object({
  /** Cursor = id of the oldest message already loaded. Returns older ones. */
  cursor: z.string().cuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type CreateDirectInput = z.infer<typeof createDirectSchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
