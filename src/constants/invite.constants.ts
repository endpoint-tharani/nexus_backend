export const USER_INVITE_CONSTANTS = {
  /** How long an organization user invite link stays valid. */
  TOKEN_EXPIRES_IN_SECONDS: 60 * 60 * 72, // 72 hours
  /** Frontend path for setting the invited user's password. */
  ACCEPT_PATH: "/accept-user-invite",
  /** Organization roles an owner can assign. Privileged platform roles are excluded. */
  ALLOWED_ROLES: ["ADMIN", "HR", "PAYROLL_MANAGER", "MANAGER", "COMPANY_ADMIN", "FINANCE", "INSTRUCTOR"] as const,
};
