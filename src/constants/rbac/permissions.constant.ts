import { UserRole } from "@prisma/client";

/**
 * RBAC matrix (Phase 13). Resources × actions, granted per role.
 * OWNER and SUPER_ADMIN bypass the matrix entirely (full access).
 */

export const RESOURCE = {
  REPORTS: "REPORTS",
  BRANCH: "BRANCH",
  AUDIT: "AUDIT",
  SUBSCRIPTION: "SUBSCRIPTION",
} as const;

export type Resource = (typeof RESOURCE)[keyof typeof RESOURCE];

export const ACTION = {
  CREATE: "CREATE",
  READ: "READ",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  APPROVE: "APPROVE",
  EXPORT: "EXPORT",
  LOCK: "LOCK",
} as const;

export type Action = (typeof ACTION)[keyof typeof ACTION];

const ALL: Action[] = Object.values(ACTION);
const READ_ONLY: Action[] = [ACTION.READ, ACTION.EXPORT];

type Matrix = Partial<Record<Resource, Action[]>>;

export const SUPER_ROLES: UserRole[] = ["OWNER", "SUPER_ADMIN"];

export const ROLE_PERMISSIONS: Record<UserRole, Matrix> = {
  // Wildcard handled in hasPermission(); empty matrices here are intentional.
  OWNER: {},
  SUPER_ADMIN: {},

  COMPANY_ADMIN: {
    REPORTS: ALL,
    BRANCH: ALL,
    AUDIT: ALL,
    SUBSCRIPTION: ALL,
  },

  FINANCE: {
    REPORTS: ALL,
  },

  ADMIN: {
    REPORTS: READ_ONLY,
    BRANCH: ALL,
    AUDIT: READ_ONLY,
    SUBSCRIPTION: ALL,
  },

  HR: {
    REPORTS: READ_ONLY,
    AUDIT: READ_ONLY,
    SUBSCRIPTION: READ_ONLY,
  },

  PAYROLL_MANAGER: {
    REPORTS: READ_ONLY,
  },

  MANAGER: {
    REPORTS: READ_ONLY,
  },

  STUDENT: {},
  INSTRUCTOR: {},
};

export function hasPermission(
  role: UserRole,
  resource: Resource,
  action: Action,
): boolean {
  if (SUPER_ROLES.includes(role)) return true;
  return ROLE_PERMISSIONS[role]?.[resource]?.includes(action) ?? false;
}
