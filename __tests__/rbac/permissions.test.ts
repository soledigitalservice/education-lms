import { describe, expect, it } from 'vitest';

import { Roles } from '@/lib/rbac/roles';
import { Permissions, permissionsFor } from '@/lib/rbac/permissions';

describe('RBAC: role → permissions mapping', () => {
  it('ADMIN can approve teachers and write any user', () => {
    const perms = permissionsFor(Roles.ADMIN);
    expect(perms).toContain(Permissions.USERS_APPROVE_TEACHER);
    expect(perms).toContain(Permissions.USERS_WRITE_ANY);
  });

  it('TEACHER can create courses but cannot approve other teachers', () => {
    const perms = permissionsFor(Roles.TEACHER);
    expect(perms).toContain(Permissions.COURSE_CREATE);
    expect(perms).toContain(Permissions.GRADE_WRITE_OWN_COURSE);
    expect(perms).not.toContain(Permissions.USERS_APPROVE_TEACHER);
  });

  it('STUDENT can submit assignments but cannot grade them', () => {
    const perms = permissionsFor(Roles.STUDENT);
    expect(perms).toContain(Permissions.ASSIGNMENT_SUBMIT);
    expect(perms).not.toContain(Permissions.GRADE_WRITE_OWN_COURSE);
  });

  it('PARENT can read child data but cannot enroll', () => {
    const perms = permissionsFor(Roles.PARENT);
    expect(perms).toContain(Permissions.GRADE_READ_CHILD);
    expect(perms).toContain(Permissions.ENROLLMENT_READ_CHILD);
    expect(perms).not.toContain(Permissions.ENROLLMENT_REQUEST);
  });

  it('every role gets at least the chat permissions (except ADMIN, who uses moderation)', () => {
    for (const role of [Roles.TEACHER, Roles.STUDENT, Roles.PARENT] as const) {
      expect(permissionsFor(role)).toContain(Permissions.CHAT_SEND);
    }
  });
});
