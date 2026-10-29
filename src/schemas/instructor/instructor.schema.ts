import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const text = (max: number) => z.string().trim().max(max).nullable().optional();
export const createInstructorSchema = z.object({ body: z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(254) }) });
export const listInstructorsSchema = z.object({ query: z.object({ search: z.string().trim().max(100).optional(), status: z.enum(["PENDING_APPROVAL", "ACTIVE", "SUSPENDED", "INACTIVE", "ARCHIVED", "REJECTED"]).optional(), branchId: id.optional(), departmentId: id.optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }) });
export const instructorIdSchema = z.object({ params: z.object({ instructorId: id }) });
export const updateInstructorSchema = z.object({ params: z.object({ instructorId: id }), body: z.object({ employeeCode: z.string().trim().max(64).nullable().optional(), phone: z.string().trim().max(32).nullable().optional(), bio: text(2000), specializations: z.array(z.string().trim().min(1).max(100)).max(30).optional(), qualification: text(200), experienceYears: z.number().int().min(0).max(80).nullable().optional(), joiningDate: z.iso.date().nullable().optional() }).strict().refine((v) => Object.keys(v).length > 0) });
export const instructorStatusSchema = z.object({ params: z.object({ instructorId: id }), body: z.object({ status: z.enum(["ACTIVE", "SUSPENDED", "INACTIVE", "ARCHIVED", "REJECTED"]), reason: z.string().trim().max(500).optional() }) });
export const branchLinkSchema = z.object({ params: z.object({ instructorId: id }), body: z.object({ branchId: id }) });
export const branchEndSchema = z.object({ params: z.object({ instructorId: id, branchId: id }) });
export const departmentLinkSchema = z.object({ params: z.object({ instructorId: id }), body: z.object({ branchId: id, departmentId: id }) });
export const departmentEndSchema = z.object({ params: z.object({ instructorId: id, departmentId: id }), query: z.object({ branchId: id }) });
export const selfUpdateInstructorSchema = z.object({ body: z.object({ phone: z.string().trim().max(32).nullable().optional(), bio: text(2000), specializations: z.array(z.string().trim().min(1).max(100)).max(30).optional(), qualification: text(200) }).strict().refine((v) => Object.keys(v).length > 0) });
export const teachingStudentsSchema = z.object({ query: z.object({ branchId: id.optional(), departmentId: id.optional(), search: z.string().trim().max(100).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(100).default(20) }), params: z.object({ studentId: id.optional() }) });
