import { InstructorStatus, Prisma, UserRole } from "@prisma/client";
import prisma from "../../database/index.db.js";
import { AppError } from "../../types/AppError.js";
import createUserInvite from "../userInvite/createUserInvite.service.js";
import recordAudit from "../audit/record/recordAudit.service.js";

type Actor = { id: string; companyId: string | null; userRole: UserRole };
const admins: UserRole[] = ["OWNER", "SUPER_ADMIN", "COMPANY_ADMIN", "ADMIN"];
const transitions: Record<InstructorStatus, InstructorStatus[]> = {
  PENDING_APPROVAL: ["ACTIVE", "REJECTED", "INACTIVE"], ACTIVE: ["SUSPENDED", "INACTIVE", "ARCHIVED"],
  SUSPENDED: ["ACTIVE", "INACTIVE", "ARCHIVED"], INACTIVE: ["ACTIVE", "ARCHIVED"], ARCHIVED: [], REJECTED: [],
};
function requireAdmin(actor: Actor) { if (!admins.includes(actor.userRole)) throw new AppError("Forbidden: administrator role required", 403); }
async function getProfile(companyId: string, instructorId: string, include = false) {
  const profile = await prisma.instructorProfile.findFirst({ where: { id: instructorId, companyId, deletedAt: null }, ...(include ? { include: { user: { select: { id: true, name: true, email: true, createdAt: true } } } } : {}) });
  if (!profile) throw new AppError("Instructor not found", 404);
  return profile;
}
async function getSelf(actor: Actor) {
  if (actor.userRole !== "INSTRUCTOR") throw new AppError("Instructor account required", 403);
  const profile = await prisma.instructorProfile.findFirst({ where: { userId: actor.id, companyId: actor.companyId ?? "", deletedAt: null, status: "ACTIVE" }, include: { user: { select: { id: true, name: true, email: true } } } });
  if (!profile) throw new AppError("Instructor profile not found", 404);
  return profile;
}
async function getAdmin(actor: Actor, companyId: string, instructorId: string) { requireAdmin(actor); return getProfile(companyId, instructorId, true); }
async function create(actor: Actor, companyId: string, input: { name: string; email: string }) {
  requireAdmin(actor);
  const invite = await createUserInvite(companyId, { ...input, email: input.email.trim().toLowerCase(), role: "INSTRUCTOR" });
  await recordAudit({ action: "INSTRUCTOR_INVITED", entityType: "InstructorInvite", entityId: invite.id, userId: actor.id, companyId });
  return invite;
}
async function list(actor: Actor, companyId: string, query: { search?: string; status?: InstructorStatus; branchId?: string; departmentId?: string; page: number; limit: number }) {
  requireAdmin(actor);
  const where: Prisma.InstructorProfileWhereInput = { companyId, deletedAt: null, ...(query.status ? { status: query.status } : {}), ...(query.search ? { OR: [{ employeeCode: { contains: query.search, mode: "insensitive" } }, { user: { name: { contains: query.search, mode: "insensitive" } } }, { user: { email: { contains: query.search, mode: "insensitive" } } }] } : {}) };
  if (query.branchId) where.branches = { some: { companyId, branchId: query.branchId, status: "ACTIVE" } };
  if (query.departmentId) where.departments = { some: { companyId, departmentId: query.departmentId, status: "ACTIVE", ...(query.branchId ? { branchId: query.branchId } : {}) } };
  const [items, total] = await prisma.$transaction([prisma.instructorProfile.findMany({ where, include: { user: { select: { id: true, name: true, email: true, createdAt: true } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }), prisma.instructorProfile.count({ where })]);
  return { items, total, page: query.page, limit: query.limit };
}
async function update(actor: Actor, companyId: string, instructorId: string, input: Record<string, unknown>) {
  requireAdmin(actor); const current = await getProfile(companyId, instructorId);
  let updated;
  try { updated = await prisma.instructorProfile.update({ where: { id: current.id }, data: { ...input, joiningDate: input.joiningDate === null ? null : typeof input.joiningDate === "string" ? new Date(input.joiningDate) : input.joiningDate as Date | undefined } }); }
  catch (error) { if ((error as { code?: string }).code === "P2002") throw new AppError("Instructor code is already in use", 409); throw error; }
  await recordAudit({ action: "INSTRUCTOR_PROFILE_UPDATED", entityType: "InstructorProfile", entityId: current.id, userId: actor.id, companyId, newValue: { fields: Object.keys(input) } }); return updated;
}
async function setStatus(actor: Actor, companyId: string, instructorId: string, status: InstructorStatus, reason?: string) {
  requireAdmin(actor); const current = await getProfile(companyId, instructorId);
  if (!transitions[current.status].includes(status)) throw new AppError(`Cannot change instructor status from ${current.status} to ${status}`, 409);
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.instructorProfile.update({ where: { id: instructorId }, data: { status, ...(status === "ACTIVE" ? { approvedAt: new Date(), approvedById: actor.id, rejectionReason: null } : {}), ...(status === "REJECTED" ? { rejectionReason: reason ?? null } : {}), ...(status === "ARCHIVED" ? { archivedAt: new Date() } : {}) } });
    if (["INACTIVE", "ARCHIVED", "REJECTED"].includes(status)) {
      await tx.instructorDepartment.updateMany({ where: { instructorId, companyId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
      await tx.instructorBranch.updateMany({ where: { instructorId, companyId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
    }
    await recordAudit({ action: `INSTRUCTOR_STATUS_${status}`, entityType: "InstructorProfile", entityId: instructorId, userId: actor.id, companyId, oldValue: { status: current.status }, newValue: { status, ...(reason ? { reason } : {}) }, tx });
    return result;
  });
  return updated;
}
async function branches(actor: Actor, companyId: string, instructorId: string) { requireAdmin(actor); await getProfile(companyId, instructorId); return prisma.instructorBranch.findMany({ where: { companyId, instructorId }, include: { branch: true }, orderBy: { startedAt: "desc" } }); }
async function addBranch(actor: Actor, companyId: string, instructorId: string, branchId: string) {
  requireAdmin(actor); const p = await getProfile(companyId, instructorId);
  try { return await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: branchId, companyId, isActive: true, deletedAt: null } }); if (!branch) throw new AppError("Branch not found in this organization", 404);
    const active = await tx.instructorBranch.findFirst({ where: { instructorId: p.id, companyId, branchId, status: "ACTIVE" } }); if (active) throw new AppError("Instructor is already linked to this branch", 409);
    const rel = await tx.instructorBranch.create({ data: { instructorId: p.id, companyId, branchId, createdByUserId: actor.id } });
    await recordAudit({ action: "INSTRUCTOR_BRANCH_LINKED", entityType: "InstructorBranch", entityId: rel.id, userId: actor.id, companyId, newValue: { instructorId, branchId }, tx }); return rel;
  }); } catch (error) { if ((error as { code?: string }).code === "P2002") throw new AppError("Instructor is already linked to this branch", 409); throw error; }
}
async function endBranch(actor: Actor, companyId: string, instructorId: string, branchId: string) {
  requireAdmin(actor); await getProfile(companyId, instructorId);
  return prisma.$transaction(async (tx) => {
    const rel = await tx.instructorBranch.findFirst({ where: { instructorId, companyId, branchId, status: "ACTIVE" } }); if (!rel) throw new AppError("Active branch relationship not found", 404);
    const now = new Date(); await tx.instructorDepartment.updateMany({ where: { instructorId, companyId, branchId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: now } });
    const ended = await tx.instructorBranch.update({ where: { id: rel.id }, data: { status: "ENDED", endedAt: now } });
    await recordAudit({ action: "INSTRUCTOR_BRANCH_ENDED", entityType: "InstructorBranch", entityId: rel.id, userId: actor.id, companyId, oldValue: { status: "ACTIVE" }, newValue: { status: "ENDED" }, tx }); return ended;
  });
}
async function departments(actor: Actor, companyId: string, instructorId: string) { requireAdmin(actor); await getProfile(companyId, instructorId); return prisma.instructorDepartment.findMany({ where: { companyId, instructorId }, include: { branch: true, department: true }, orderBy: { startedAt: "desc" } }); }
async function addDepartment(actor: Actor, companyId: string, instructorId: string, branchId: string, departmentId: string) {
  requireAdmin(actor); await getProfile(companyId, instructorId);
  try { return await prisma.$transaction(async (tx) => {
    const link = await tx.instructorBranch.findFirst({ where: { instructorId, companyId, branchId, status: "ACTIVE" } }); if (!link) throw new AppError("Instructor is not linked to this branch", 400);
    const department = await tx.department.findFirst({ where: { id: departmentId, companyId, branchId, deletedAt: null } }); if (!department) throw new AppError("Department not found in this organization and branch", 400);
    if (await tx.instructorDepartment.findFirst({ where: { instructorId, companyId, branchId, departmentId, status: "ACTIVE" } })) throw new AppError("Instructor is already linked to this department", 409);
    const rel = await tx.instructorDepartment.create({ data: { instructorId, instructorBranchId: link.id, companyId, branchId, departmentId, createdByUserId: actor.id } });
    await recordAudit({ action: "INSTRUCTOR_DEPARTMENT_LINKED", entityType: "InstructorDepartment", entityId: rel.id, userId: actor.id, companyId, newValue: { instructorId, branchId, departmentId }, tx }); return rel;
  }); } catch (error) { if ((error as { code?: string }).code === "P2002") throw new AppError("Instructor is already linked to this department", 409); throw error; }
}
async function endDepartment(actor: Actor, companyId: string, instructorId: string, branchId: string, departmentId: string) {
  requireAdmin(actor); await getProfile(companyId, instructorId);
  const rel = await prisma.instructorDepartment.findFirst({ where: { instructorId, companyId, branchId, departmentId, status: "ACTIVE" } }); if (!rel) throw new AppError("Active department relationship not found", 404);
  return prisma.$transaction(async (tx) => {
    const ended = await tx.instructorDepartment.update({ where: { id: rel.id }, data: { status: "ENDED", endedAt: new Date() } });
    await recordAudit({ action: "INSTRUCTOR_DEPARTMENT_ENDED", entityType: "InstructorDepartment", entityId: rel.id, userId: actor.id, companyId, oldValue: { status: "ACTIVE" }, newValue: { status: "ENDED" }, tx }); return ended;
  });
}
async function self(actor: Actor) { return getSelf(actor); }
async function updateSelf(actor: Actor, input: Record<string, unknown>) {
  const p = await getSelf(actor);
  const updated = await prisma.instructorProfile.update({ where: { id: p.id }, data: input });
  await recordAudit({ action: "INSTRUCTOR_PROFILE_SELF_UPDATED", entityType: "InstructorProfile", entityId: p.id, userId: actor.id, companyId: p.companyId, newValue: { fields: Object.keys(input) } });
  return updated;
}
async function myBranches(actor: Actor) { const p = await getSelf(actor); return prisma.instructorBranch.findMany({ where: { instructorId: p.id, status: "ACTIVE" }, include: { branch: true }, orderBy: { startedAt: "desc" } }); }
async function myDepartments(actor: Actor) { const p = await getSelf(actor); return prisma.instructorDepartment.findMany({ where: { instructorId: p.id, status: "ACTIVE" }, include: { branch: true, department: true }, orderBy: { startedAt: "desc" } }); }
async function teachingStudents(actor: Actor, query: { branchId?: string; departmentId?: string; search?: string; page: number; limit: number }) {
  const p = await getSelf(actor);
  const links = await prisma.instructorBranch.findMany({ where: { instructorId: p.id, companyId: p.companyId, status: "ACTIVE", ...(query.branchId ? { branchId: query.branchId } : {}) }, include: { departments: { select: { departmentId: true, status: true } } } });
  if (query.branchId && !links.length) throw new AppError("Branch not found", 404);
  const branchWide = links.filter((l) => l.departments.length === 0).map((l) => l.branchId);
  const deptIdsByBranch = new Map(links.filter((l) => l.departments.length > 0).map((l) => [l.branchId, l.departments.filter((d) => d.status === "ACTIVE").map((d) => d.departmentId)]).filter(([, ids]) => ids.length > 0) as [string, string[]][]);
  const conditions: Prisma.StudentProfileWhereInput[] = [...branchWide.map((branchId) => ({ branchId })), ...[...deptIdsByBranch].map(([branchId, ids]) => ({ branchId, memberships: { some: { status: "ACTIVE" as const, departmentId: { in: ids } } } }))];
  if (!conditions.length) return { items: [], total: 0, page: query.page, limit: query.limit };
  if (query.departmentId) {
    const allowed = links.some((l) => branchWide.includes(l.branchId) || l.departments.some((d) => d.status === "ACTIVE" && d.departmentId === query.departmentId));
    if (!allowed) throw new AppError("Department not found", 404);
  }
  const where: Prisma.StudentProfileWhereInput = {
    companyId: p.companyId, status: "ACTIVE",
    AND: [
      { OR: conditions },
      ...(query.departmentId ? [{ memberships: { some: { status: "ACTIVE" as const, departmentId: query.departmentId } } }] : []),
      ...(query.search ? [{ OR: [{ admissionNumber: { contains: query.search, mode: "insensitive" as const } }, { user: { name: { contains: query.search, mode: "insensitive" as const } } }, { user: { email: { contains: query.search, mode: "insensitive" as const } } }] }] : []),
    ],
  };
  const [items, total] = await prisma.$transaction([prisma.studentProfile.findMany({ where, include: { user: { select: { id: true, name: true, email: true } }, memberships: { where: { status: "ACTIVE" }, include: { department: true } } }, orderBy: { createdAt: "desc" }, skip: (query.page - 1) * query.limit, take: query.limit }), prisma.studentProfile.count({ where })]);
  return { items, total, page: query.page, limit: query.limit };
}
async function studentActivities(actor: Actor, studentId: string, page: number, limit: number) {
  const p = await getSelf(actor);
  const student = await prisma.studentProfile.findFirst({ where: { id: studentId, companyId: p.companyId, status: "ACTIVE" }, include: { memberships: { where: { status: "ACTIVE" }, select: { departmentId: true } } } });
  if (!student) throw new AppError("Student not found", 404);
  const scopes = await prisma.instructorBranch.findMany({ where: { instructorId: p.id, companyId: p.companyId, branchId: student.branchId, status: "ACTIVE" }, include: { departments: { select: { departmentId: true, status: true } } } });
  const allowed = scopes.some((scope) => scope.departments.length === 0 || scope.departments.some((d) => d.status === "ACTIVE" && student.memberships.some((m) => m.departmentId === d.departmentId)));
  if (!allowed) throw new AppError("Student not found", 404);
  const where = { studentId, companyId: student.companyId };
  const [items, total] = await prisma.$transaction([prisma.studentActivity.findMany({ where, orderBy: { occurredAt: "desc" }, skip: (page - 1) * limit, take: limit }), prisma.studentActivity.count({ where })]);
  return { items, total, page, limit };
}
export default { create, list, get: getAdmin, update, setStatus, branches, addBranch, endBranch, departments, addDepartment, endDepartment, self, updateSelf, myBranches, myDepartments, teachingStudents, studentActivities };
