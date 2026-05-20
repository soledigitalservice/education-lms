/**
 * Roles are mirrored from the Prisma enum so both client and server can
 * reference the same constants without importing @prisma/client into the
 * browser bundle.
 *
 * MUST stay in sync with the `Role` enum in prisma/schema.prisma.
 */
export const Roles = {
  ADMIN: 'ADMIN',
  TEACHER: 'TEACHER',
  PARENT: 'PARENT',
  STUDENT: 'STUDENT',
} as const;

export type Role = (typeof Roles)[keyof typeof Roles];

export const ALL_ROLES: Role[] = [Roles.ADMIN, Roles.TEACHER, Roles.PARENT, Roles.STUDENT];

export const AccountStatus = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  ACTIVE: 'ACTIVE',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;

export type AccountStatusType = (typeof AccountStatus)[keyof typeof AccountStatus];

/** Role labels for UI rendering (Spanish). */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  TEACHER: 'Profesor',
  PARENT: 'Padre / Madre',
  STUDENT: 'Estudiante',
};
