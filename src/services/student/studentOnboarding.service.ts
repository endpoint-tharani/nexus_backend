import { CredentialType, OtpPurpose, Prisma, StudentStatus, UserRole } from "@prisma/client";
import { randomToken, sha256Base64Url } from "../../utils/crypto.util.js";
import prisma from "../../database/index.db.js";
import AUTH_SERVICE from "../auth/index.service.js";
import OTP_SERVICE from "../auth/OTP/persistentOtp.service.js";
import AWS_SERVICE from "../aws/index.service.js";
import { AppError } from "../../types/AppError.js";

const adminRoles: UserRole[] = ["OWNER", "SUPER_ADMIN", "COMPANY_ADMIN", "ADMIN"];
const invalidSetup = () => new AppError("Invalid or unavailable student setup request", 400);

export async function setSelfRegistration(actor: { userRole: UserRole }, companyId: string, enabled: boolean) {
  if (!adminRoles.includes(actor.userRole)) throw new AppError("Forbidden: administrator role required", 403);
  return prisma.company.update({ where: { id: companyId }, data: { studentSelfRegistrationEnabled: enabled }, select: { id: true, studentSelfRegistrationEnabled: true } });
}

export async function createAdmissionCode(
  actor: { id: string; userRole: UserRole },
  companyId: string,
  input: { branchId: string; maxUses: number; expiresInDays: number; allowsSelfRegistration: boolean; requiresApproval: boolean },
) {
  if (!adminRoles.includes(actor.userRole)) throw new AppError("Forbidden: administrator role required", 403);
  const rawCode = randomToken(32);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const admissionCode = await prisma.$transaction(async (tx) => {
    const branch = await tx.branch.findFirst({ where: { id: input.branchId, companyId, deletedAt: null, isActive: true }, select: { id: true } });
    if (!branch) throw new AppError("Branch not found in this organization", 400);
    return tx.studentAdmissionCode.create({ data: {
      companyId, branchId: branch.id, codeHash: sha256Base64Url(rawCode), maxUses: input.maxUses,
      expiresAt, allowsSelfRegistration: input.allowsSelfRegistration, requiresApproval: input.requiresApproval,
      createdById: actor.id,
    }, select: { id: true } });
  });
  return { id: admissionCode.id, code: rawCode, branchId: input.branchId, expiresAt, maxUses: input.maxUses, requiresApproval: input.requiresApproval };
}

export async function revokeAdmissionCode(actor: { userRole: UserRole }, companyId: string, codeId: string) {
  if (!adminRoles.includes(actor.userRole)) throw new AppError("Forbidden: administrator role required", 403);
  const updated = await prisma.studentAdmissionCode.updateMany({ where: { id: codeId, companyId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (updated.count !== 1) throw new AppError("Admission code not found", 404);
  return { revoked: true };
}

type RegistrationData = {
  code: string; name: string; email: string; password: string; admissionNumber: string; departmentIds: string[];
  dateOfBirth?: string; phone?: string; address?: string | null; guardianName?: string | null;
  guardianPhone?: string | null; guardianEmail?: string | null; emergencyContact?: string | null;
};

export async function registerWithAdmissionCode(input: RegistrationData, ipAddress: string) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const passwordHash = await AUTH_SERVICE.PASSWORD.hashPassword(input.password);
  const result = await prisma.$transaction(async (tx) => {
    const admission = await tx.studentAdmissionCode.findFirst({
      where: { codeHash: sha256Base64Url(input.code), revokedAt: null, expiresAt: { gt: new Date() } },
      include: { company: { select: { studentSelfRegistrationEnabled: true } }, branch: { select: { companyId: true, id: true, isActive: true, deletedAt: true } } },
    });
    if (!admission || admission.branch.companyId !== admission.companyId || !admission.branch.isActive || admission.branch.deletedAt) throw invalidSetup();
    if (admission.allowsSelfRegistration && !admission.company.studentSelfRegistrationEnabled) throw invalidSetup();
    const departmentIds = [...new Set(input.departmentIds)];
    if (departmentIds.length) {
      const departments = await tx.department.findMany({ where: { id: { in: departmentIds }, companyId: admission.companyId, deletedAt: null } });
      if (departments.length !== departmentIds.length || departments.some((department) => department.branchId !== admission.branchId)) {
        throw new AppError("Every department must belong to the admission code's organization and branch", 400);
      }
    }
    if (await tx.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })) throw new AppError("Email already in use", 409);
    const claimed = await tx.studentAdmissionCode.updateMany({
      where: { id: admission.id, revokedAt: null, expiresAt: { gt: new Date() }, uses: { lt: admission.maxUses } },
      data: { uses: { increment: 1 } },
    });
    if (claimed.count !== 1) throw invalidSetup();

    const status: StudentStatus = admission.requiresApproval ? "PENDING_APPROVAL" : "ACTIVE";
    const user = await tx.user.create({ data: {
      name: input.name.trim(), email: normalizedEmail, userRole: "STUDENT", companyId: admission.companyId,
      isEmailVerified: false,
      credential: { create: { type: CredentialType.EMAIL, passwordHash } },
    } });
    const profile = await tx.studentProfile.create({ data: {
      userId: user.id, companyId: admission.companyId, branchId: admission.branchId,
      admissionNumber: input.admissionNumber.trim(), status,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : undefined,
      phone: input.phone, address: input.address, guardianName: input.guardianName,
      guardianPhone: input.guardianPhone, guardianEmail: input.guardianEmail, emergencyContact: input.emergencyContact,
    } });
    if (departmentIds.length) await tx.studentDepartment.createMany({ data: departmentIds.map((departmentId) => ({ studentId: profile.id, departmentId, companyId: admission.companyId, branchId: admission.branchId })) });
    await tx.studentActivity.create({ data: {
      studentId: profile.id, companyId: admission.companyId, branchId: admission.branchId,
      type: "REGISTERED", description: "Student registered using an admission code", metadata: { requiresApproval: admission.requiresApproval },
    } });
    return { profile, user };
  }, { maxWait: 10_000, timeout: 20_000 });

  if (result.user) {
    const otp = await OTP_SERVICE.issuePersistentOtp(normalizedEmail, OtpPurpose.EMAIL_VERIFICATION, result.user.id, ipAddress);
    if (otp) await AWS_SERVICE.EMAIL.sendEmail({ to: [normalizedEmail], subject: "Verify your student account", text: `Your email verification code is: ${otp}` });
  }
  return prisma.studentProfile.findUniqueOrThrow({ where: { id: result.profile.id }, include: { user: { select: { id: true, name: true, email: true } } } });
}

export async function requestStudentSetup(email: string, ipAddress: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!await OTP_SERVICE.recordOtpRequest(ipAddress, OtpPurpose.STUDENT_SETUP)) return;
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail, deletedAt: null }, include: { studentProfile: true, credential: { select: { id: true } } } });
  if (!user || user.userRole !== "STUDENT" || !user.mustChangePassword || user.credential || !user.studentProfile || ["ARCHIVED", "REJECTED", "INACTIVE"].includes(user.studentProfile.status)) return;
  const otp = await OTP_SERVICE.issuePersistentOtp(normalizedEmail, OtpPurpose.STUDENT_SETUP, user.id, ipAddress);
  if (otp) await AWS_SERVICE.EMAIL.sendEmail({ to: [normalizedEmail], subject: "Set up your student account", text: `Your one-time account setup code is: ${otp}. It expires in 10 minutes.` });
}

export async function completeStudentSetup(email: string, otp: string, password: string, ipAddress: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!await OTP_SERVICE.recordOtpVerificationAttempt(ipAddress, OtpPurpose.STUDENT_SETUP)) throw invalidSetup();
  const user = await prisma.user.findUnique({ where: { email: normalizedEmail, deletedAt: null }, include: { studentProfile: true, credential: true } });
  if (!user || user.userRole !== "STUDENT" || !user.mustChangePassword || user.credential || !user.studentProfile || ["ARCHIVED", "REJECTED", "INACTIVE"].includes(user.studentProfile.status)) throw invalidSetup();
  if (!await OTP_SERVICE.consumePersistentOtp(normalizedEmail, OtpPurpose.STUDENT_SETUP, otp, user.id, ipAddress)) throw invalidSetup();
  const passwordHash = await AUTH_SERVICE.PASSWORD.hashPassword(password);
  await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({ where: { id: user.id }, include: { credential: true } });
    if (!current || !current.mustChangePassword || current.credential) throw invalidSetup();
    await tx.credential.create({ data: { userId: user.id, type: CredentialType.EMAIL, passwordHash } });
    await tx.user.update({ where: { id: user.id }, data: { mustChangePassword: false, isEmailVerified: true } });
  });
  return { message: "Student account setup complete. Sign in with your new password." };
}

export async function enforceActiveStudent(userId: string, tx: Prisma.TransactionClient = prisma) {
  const profile = await tx.studentProfile.findUnique({ where: { userId }, select: { status: true } });
  return profile?.status === "ACTIVE";
}
