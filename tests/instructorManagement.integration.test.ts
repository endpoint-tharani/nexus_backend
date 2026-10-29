import { afterAll, beforeAll, describe, expect, it } from "vitest";

const testUrl = process.env.TEST_DATABASE_URL?.trim();
const integrationEnabled = Boolean(process.env.STUDENT_INTEGRATION_SAFE === "1" && testUrl && testUrl === process.env.DATABASE_URL?.trim());

describe.skipIf(!integrationEnabled)("instructor management PostgreSQL integration", () => {
  let prisma: (typeof import("../src/database/index.db.js"))["default"];
  let service: typeof import("../src/services/instructor/instructor.service.js")["default"];
  const fixtures: string[] = [];

  beforeAll(async () => {
    if (!integrationEnabled) return;
    process.env.DATABASE_URL = testUrl;
    ({ default: prisma } = await import("../src/database/index.db.js"));
    ({ default: service } = await import("../src/services/instructor/instructor.service.js"));
  }, 30000);

  async function fixture() {
    const tag = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const company = await prisma.company.create({ data: { name: `Instructor ${tag}` } });
    fixtures.push(company.id);
    const admin = await prisma.user.create({ data: { name: "Instructor Admin", email: `admin-${tag}@integration.test`, userRole: "ADMIN", companyId: company.id } });
    const branch = await prisma.branch.create({ data: { companyId: company.id, name: "Branch A", code: `A-${tag}` } });
    const otherBranch = await prisma.branch.create({ data: { companyId: company.id, name: "Branch B", code: `B-${tag}` } });
    const dept = await prisma.department.create({ data: { companyId: company.id, branchId: branch.id, name: `Department ${tag}` } });
    const wrongDept = await prisma.department.create({ data: { companyId: company.id, branchId: otherBranch.id, name: `Other ${tag}` } });
    const user = await prisma.user.create({ data: { name: "Instructor", email: `instructor-${tag}@integration.test`, userRole: "INSTRUCTOR", companyId: company.id } });
    const profile = await prisma.instructorProfile.create({ data: { userId: user.id, companyId: company.id, status: "ACTIVE" } });
    return { companyId: company.id, admin: { id: admin.id, companyId: company.id, userRole: "ADMIN" as const }, branch, otherBranch, dept, wrongDept, user, profile };
  }

  afterAll(async () => {
    if (!integrationEnabled || !prisma) return;
    for (const companyId of fixtures) {
      await prisma.auditLog.deleteMany({ where: { companyId } });
      await prisma.instructorDepartment.deleteMany({ where: { companyId } });
      await prisma.instructorBranch.deleteMany({ where: { companyId } });
      await prisma.instructorProfile.deleteMany({ where: { companyId } });
      await prisma.user.deleteMany({ where: { companyId } });
      await prisma.department.deleteMany({ where: { companyId } });
      await prisma.branch.deleteMany({ where: { companyId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
    }
    await prisma.$disconnect();
  }, 30000);

  it("links scoped branches and departments and preserves relationship history", async () => {
    const fx = await fixture();
    await service.addBranch(fx.admin, fx.companyId, fx.profile.id, fx.branch.id);
    await service.addBranch(fx.admin, fx.companyId, fx.profile.id, fx.otherBranch.id);
    await service.addDepartment(fx.admin, fx.companyId, fx.profile.id, fx.branch.id, fx.dept.id);
    await expect(service.addDepartment(fx.admin, fx.companyId, fx.profile.id, fx.branch.id, fx.wrongDept.id)).rejects.toThrow("Department not found");
    await service.endBranch(fx.admin, fx.companyId, fx.profile.id, fx.branch.id);
    const rows = await prisma.instructorBranch.findMany({ where: { instructorId: fx.profile.id, branchId: fx.branch.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "ENDED", endedAt: expect.any(Date) });
    expect(await prisma.instructorDepartment.findMany({ where: { instructorId: fx.profile.id, branchId: fx.branch.id, status: "ENDED" } })).toHaveLength(1);
  });

  it("rejects cross company and duplicate active relationships at service and database levels", async () => {
    const fx = await fixture();
    await service.addBranch(fx.admin, fx.companyId, fx.profile.id, fx.branch.id);
    await expect(service.addBranch(fx.admin, fx.companyId, fx.profile.id, fx.branch.id)).rejects.toThrow("already linked");
    const foreignCompany = await prisma.company.create({ data: { name: `Foreign ${Date.now()}` } });
    const foreignBranch = await prisma.branch.create({ data: { companyId: foreignCompany.id, name: "Foreign", code: `F-${Date.now()}` } });
    await expect(prisma.instructorBranch.create({ data: { companyId: fx.companyId, instructorId: fx.profile.id, branchId: foreignBranch.id } })).rejects.toThrow();
    await prisma.branch.delete({ where: { id: foreignBranch.id } });
    await prisma.company.delete({ where: { id: foreignCompany.id } });
  });

  it("gates approval and ends active scopes when an instructor is archived", async () => {
    const fx = await fixture();
    const pending = await prisma.instructorProfile.update({ where: { id: fx.profile.id }, data: { status: "PENDING_APPROVAL" } });
    await service.setStatus(fx.admin, fx.companyId, pending.id, "ACTIVE");
    await service.addBranch(fx.admin, fx.companyId, fx.profile.id, fx.branch.id);
    await service.setStatus(fx.admin, fx.companyId, fx.profile.id, "ARCHIVED");
    expect(await prisma.instructorBranch.findFirst({ where: { instructorId: fx.profile.id, status: "ACTIVE" } })).toBeNull();
    await expect(service.setStatus(fx.admin, fx.companyId, fx.profile.id, "ACTIVE")).rejects.toThrow("Cannot change instructor status");
  });
});
