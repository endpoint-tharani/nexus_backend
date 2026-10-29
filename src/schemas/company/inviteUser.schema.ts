import z from "zod";
import { emailSchema } from "../base/credentials.schema.js";

export const inviteUserSchema = z.object({
  body: z.object({
    email: emailSchema,
    name: z.string().min(1).max(120),
    // Owners may grant organization roles, but not platform-level roles.
    role: z.enum(["ADMIN", "HR", "PAYROLL_MANAGER", "MANAGER", "COMPANY_ADMIN", "FINANCE", "INSTRUCTOR"]),
  }),
});

export type InviteUserInput = z.infer<typeof inviteUserSchema>["body"];
