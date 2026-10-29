-- Preserve student company/branch scope constraints and existing data.
-- Align the custom instructor FK names with the names expected by Prisma 7.
ALTER TABLE "InstructorBranch" RENAME CONSTRAINT "InstructorBranch_company_branch_fkey" TO "InstructorBranch_companyId_branchId_fkey";
ALTER TABLE "InstructorBranch" RENAME CONSTRAINT "InstructorBranch_instructor_company_fkey" TO "InstructorBranch_instructorId_companyId_fkey";
ALTER TABLE "InstructorDepartment" RENAME CONSTRAINT "InstructorDepartment_branch_relationship_fkey" TO "InstructorDepartment_instructorBranchId_instructorId_branc_fkey";
ALTER TABLE "InstructorDepartment" RENAME CONSTRAINT "InstructorDepartment_company_branch_fkey" TO "InstructorDepartment_companyId_branchId_fkey";
ALTER TABLE "InstructorDepartment" RENAME CONSTRAINT "InstructorDepartment_department_scope_fkey" TO "InstructorDepartment_departmentId_companyId_branchId_fkey";
ALTER TABLE "InstructorDepartment" RENAME CONSTRAINT "InstructorDepartment_instructor_company_fkey" TO "InstructorDepartment_instructorId_companyId_fkey";
ALTER TABLE "InstructorProfile" RENAME CONSTRAINT "InstructorProfile_user_company_fkey" TO "InstructorProfile_userId_companyId_fkey";
