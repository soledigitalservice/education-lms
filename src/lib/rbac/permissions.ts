import { Roles, type Role } from './roles';

/**
 * Granular permission strings.
 *
 *   <resource>.<action>[.<scope>]
 *     scope ∈ { own, any, child, enrolled }
 *
 * The backend attaches the user's permission set to the JWT at issue time;
 * the frontend uses the same identifiers to gate UI elements.
 */
export const Permissions = {
  // Users
  USERS_READ_ANY: 'users.read.any',
  USERS_WRITE_ANY: 'users.write.any',
  USERS_APPROVE_TEACHER: 'users.approve_teacher',

  // Courses
  COURSE_READ_ANY: 'course.read.any',
  COURSE_READ_OWN: 'course.read.own',
  COURSE_CREATE: 'course.create',
  COURSE_UPDATE_OWN: 'course.update.own',
  COURSE_UPDATE_ANY: 'course.update.any',
  COURSE_DELETE_OWN: 'course.delete.own',
  COURSE_DELETE_ANY: 'course.delete.any',

  // Enrollments
  ENROLLMENT_REQUEST: 'enrollment.request',
  ENROLLMENT_APPROVE_OWN_COURSE: 'enrollment.approve.own_course',
  ENROLLMENT_REMOVE_OWN_COURSE: 'enrollment.remove.own_course',
  ENROLLMENT_READ_OWN: 'enrollment.read.own',
  ENROLLMENT_READ_CHILD: 'enrollment.read.child',

  // Materials
  LESSON_MANAGE_OWN: 'lesson.manage.own',
  MATERIAL_READ_ENROLLED: 'material.read.enrolled',

  // Assignments / submissions
  ASSIGNMENT_CREATE_OWN_COURSE: 'assignment.create.own_course',
  ASSIGNMENT_SUBMIT: 'assignment.submit',
  ASSIGNMENT_READ_OWN_SUBMISSION: 'assignment.read.own_submission',
  ASSIGNMENT_READ_CHILD_SUBMISSION: 'assignment.read.child_submission',

  // Grades
  GRADE_WRITE_OWN_COURSE: 'grade.write.own_course',
  GRADE_READ_OWN: 'grade.read.own',
  GRADE_READ_CHILD: 'grade.read.child',
  GRADE_READ_ANY: 'grade.read.any',

  // Live + recordings
  LIVE_HOST: 'live.host',
  LIVE_JOIN_ENROLLED: 'live.join.enrolled',
  RECORDING_READ_ENROLLED: 'recording.read.enrolled',
  RECORDING_READ_CHILD: 'recording.read.child',

  // Chat
  CHAT_SEND: 'chat.send',
  CHAT_READ_OWN: 'chat.read.own',

  // Forums
  FORUM_POST: 'forum.post',
  FORUM_MODERATE_OWN_COURSE: 'forum.moderate.own_course',

  // Parent linking
  PARENT_LINK_REQUEST: 'parent_link.request',
  PARENT_LINK_APPROVE: 'parent_link.approve',
} as const;

export type Permission = (typeof Permissions)[keyof typeof Permissions];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  [Roles.ADMIN]: [
    Permissions.USERS_READ_ANY,
    Permissions.USERS_WRITE_ANY,
    Permissions.USERS_APPROVE_TEACHER,
    Permissions.COURSE_READ_ANY,
    Permissions.COURSE_CREATE,
    Permissions.COURSE_UPDATE_ANY,
    Permissions.COURSE_DELETE_ANY,
    Permissions.GRADE_READ_ANY,
    Permissions.PARENT_LINK_APPROVE,
    Permissions.FORUM_MODERATE_OWN_COURSE,
  ],
  [Roles.TEACHER]: [
    Permissions.COURSE_READ_OWN,
    Permissions.COURSE_CREATE,
    Permissions.COURSE_UPDATE_OWN,
    Permissions.COURSE_DELETE_OWN,
    Permissions.ENROLLMENT_APPROVE_OWN_COURSE,
    Permissions.ENROLLMENT_REMOVE_OWN_COURSE,
    Permissions.LESSON_MANAGE_OWN,
    Permissions.ASSIGNMENT_CREATE_OWN_COURSE,
    Permissions.GRADE_WRITE_OWN_COURSE,
    Permissions.LIVE_HOST,
    Permissions.CHAT_SEND,
    Permissions.CHAT_READ_OWN,
    Permissions.FORUM_POST,
    Permissions.FORUM_MODERATE_OWN_COURSE,
  ],
  [Roles.STUDENT]: [
    Permissions.COURSE_READ_ANY,
    Permissions.ENROLLMENT_REQUEST,
    Permissions.ENROLLMENT_READ_OWN,
    Permissions.MATERIAL_READ_ENROLLED,
    Permissions.ASSIGNMENT_SUBMIT,
    Permissions.ASSIGNMENT_READ_OWN_SUBMISSION,
    Permissions.GRADE_READ_OWN,
    Permissions.LIVE_JOIN_ENROLLED,
    Permissions.RECORDING_READ_ENROLLED,
    Permissions.CHAT_SEND,
    Permissions.CHAT_READ_OWN,
    Permissions.FORUM_POST,
    Permissions.PARENT_LINK_APPROVE,
  ],
  [Roles.PARENT]: [
    Permissions.COURSE_READ_ANY,
    Permissions.ENROLLMENT_READ_CHILD,
    Permissions.ASSIGNMENT_READ_CHILD_SUBMISSION,
    Permissions.GRADE_READ_CHILD,
    Permissions.RECORDING_READ_CHILD,
    Permissions.CHAT_SEND,
    Permissions.CHAT_READ_OWN,
    Permissions.PARENT_LINK_REQUEST,
  ],
};

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}
