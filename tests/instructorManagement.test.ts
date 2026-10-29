import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  instructorProfile: { findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  instructorBranch: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  instructorDepartment: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  branch: { findFirst: vi.fn() }, department: { findFirst: vi.fn() }, studentProfile: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() }, studentActivity: { findMany: vi.fn(), count: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("../src/database/index.db.js", () => ({ default: db }));

import service from "../src/services/instructor/instructor.service.js";

describe("instructor management authorization and lifecycle", () => {
  const instructor = { id: "instructor-user", companyId: "company-1", userRole: "INSTRUCTOR" as const };
  beforeEach(() => { vi.clearAllMocks(); });

  it("does not allow instructors to create privileged accounts", async () => {
    await expect(service.create(instructor, "company-1", { name: "Other", email: "other@example.test" })).rejects.toThrow("administrator role required");
  });

  it("does not allow instructors to manage branch links", async () => {
    await expect(service.branches(instructor, "company-1", "profile-1")).rejects.toThrow("administrator role required");
    expect(db.instructorProfile.findFirst).not.toHaveBeenCalled();
  });

  it("rejects reactivation after archival", async () => {
    db.instructorProfile.findFirst.mockResolvedValue({ id: "profile-1", companyId: "company-1", status: "ARCHIVED", deletedAt: null });
    await expect(service.setStatus({ id: "admin-1", companyId: "company-1", userRole: "ADMIN" }, "company-1", "profile-1", "ACTIVE")).rejects.toThrow("Cannot change instructor status from ARCHIVED to ACTIVE");
  });

  it("only exposes self-service to active instructor profiles", async () => {
    db.instructorProfile.findFirst.mockResolvedValue(null);
    await expect(service.self(instructor)).rejects.toThrow("Instructor profile not found");
    expect(db.instructorProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: instructor.id, companyId: instructor.companyId, status: "ACTIVE" }) }));
  });
});
