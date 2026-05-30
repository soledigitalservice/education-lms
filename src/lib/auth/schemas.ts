import { z } from 'zod';
import { Roles } from '../rbac/roles';

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a digit'),
  fullName: z.string().min(2).max(120),
  role: z.enum([Roles.TEACHER, Roles.PARENT, Roles.STUDENT]),
  phone: z.string().max(32).optional(),
});

/** Admin-only user creation: same as register + allows ADMIN role. */
export const adminCreateUserSchema = z.object({
  email: z.string().email().max(254),
  password: z
    .string()
    .min(10, 'Password must be at least 10 characters')
    .max(128)
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[0-9]/, 'Password must contain a digit'),
  fullName: z.string().min(2).max(120),
  role: z.enum([Roles.TEACHER, Roles.PARENT, Roles.STUDENT, Roles.ADMIN]),
  phone: z.string().max(32).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
