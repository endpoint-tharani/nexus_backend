ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'INSTRUCTOR';

CREATE TYPE "InstructorStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'INACTIVE', 'ARCHIVED', 'REJECTED');
CREATE TYPE "InstructorRelationshipStatus" AS ENUM ('ACTIVE', 'ENDED');

CREATE UNIQUE INDEX "User_id_companyId_key" ON "User"("id", "companyId");

CREATE TABLE "InstructorProfile" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "employeeCode" TEXT,
  "phone" TEXT,
  "bio" TEXT,
  "specializations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "qualification" TEXT,
  "experienceYears" INTEGER,
  "joiningDate" TIMESTAMP(3),
  "status" "InstructorStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approvedAt" TIMESTAMP(3),
  "approvedById" TEXT,
  "rejectionReason" TEXT,
  "archivedAt" TIMESTAMP(3),
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InstructorProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstructorBranch" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "status" "InstructorRelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT,
  CONSTRAINT "InstructorBranch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InstructorDepartment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "instructorId" TEXT NOT NULL,
  "instructorBranchId" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "status" "InstructorRelationshipStatus" NOT NULL DEFAULT 'ACTIVE',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT,
  CONSTRAINT "InstructorDepartment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstructorProfile_userId_key" ON "InstructorProfile"("userId");
CREATE UNIQUE INDEX "InstructorProfile_id_companyId_key" ON "InstructorProfile"("id", "companyId");
CREATE UNIQUE INDEX "InstructorProfile_userId_companyId_key" ON "InstructorProfile"("userId", "companyId");
CREATE UNIQUE INDEX "InstructorProfile_companyId_employeeCode_key" ON "InstructorProfile"("companyId", "employeeCode");
CREATE INDEX "InstructorProfile_companyId_status_createdAt_idx" ON "InstructorProfile"("companyId", "status", "createdAt");
CREATE UNIQUE INDEX "InstructorBranch_id_instructorId_branchId_companyId_key" ON "InstructorBranch"("id", "instructorId", "branchId", "companyId");
CREATE INDEX "InstructorBranch_companyId_branchId_status_idx" ON "InstructorBranch"("companyId", "branchId", "status");
CREATE INDEX "InstructorBranch_instructorId_status_idx" ON "InstructorBranch"("instructorId", "status");
CREATE UNIQUE INDEX "InstructorBranch_one_active_per_pair" ON "InstructorBranch"("instructorId", "branchId") WHERE "status" = 'ACTIVE';
CREATE INDEX "InstructorDepartment_companyId_branchId_departmentId_status_idx" ON "InstructorDepartment"("companyId", "branchId", "departmentId", "status");
CREATE INDEX "InstructorDepartment_instructorId_status_idx" ON "InstructorDepartment"("instructorId", "status");
CREATE UNIQUE INDEX "InstructorDepartment_one_active_per_pair" ON "InstructorDepartment"("instructorId", "branchId", "departmentId") WHERE "status" = 'ACTIVE';

ALTER TABLE "InstructorProfile" ADD CONSTRAINT "InstructorProfile_user_company_fkey" FOREIGN KEY ("userId", "companyId") REFERENCES "User"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorProfile" ADD CONSTRAINT "InstructorProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorProfile" ADD CONSTRAINT "InstructorProfile_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InstructorBranch" ADD CONSTRAINT "InstructorBranch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorBranch" ADD CONSTRAINT "InstructorBranch_instructor_company_fkey" FOREIGN KEY ("instructorId", "companyId") REFERENCES "InstructorProfile"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorBranch" ADD CONSTRAINT "InstructorBranch_company_branch_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstructorBranch" ADD CONSTRAINT "InstructorBranch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InstructorDepartment" ADD CONSTRAINT "InstructorDepartment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorDepartment" ADD CONSTRAINT "InstructorDepartment_instructor_company_fkey" FOREIGN KEY ("instructorId", "companyId") REFERENCES "InstructorProfile"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InstructorDepartment" ADD CONSTRAINT "InstructorDepartment_company_branch_fkey" FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstructorDepartment" ADD CONSTRAINT "InstructorDepartment_department_scope_fkey" FOREIGN KEY ("departmentId", "companyId", "branchId") REFERENCES "Department"("id", "companyId", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstructorDepartment" ADD CONSTRAINT "InstructorDepartment_branch_relationship_fkey" FOREIGN KEY ("instructorBranchId", "instructorId", "branchId", "companyId") REFERENCES "InstructorBranch"("id", "instructorId", "branchId", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InstructorDepartment" ADD CONSTRAINT "InstructorDepartment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
