import { z } from 'zod';
import { AccountStatus, Role } from '@prisma/client';

export const listUsersQuerySchema = z.object({
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(AccountStatus).optional(),
  q: z.string().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const approveTeacherSchema = z.object({
  note: z.string().max(500).optional(),
});

export const rejectTeacherSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const updateStatusSchema = z.object({
  reason: z.string().max(500).optional(),
});
