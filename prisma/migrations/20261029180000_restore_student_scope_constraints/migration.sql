-- Student scope constraints were originally added by the student-management migration.
-- Restore them if a previously generated migration removed them from the database.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentProfile_companyId_branchId_fkey') THEN
    ALTER TABLE "StudentProfile" ADD CONSTRAINT "StudentProfile_companyId_branchId_fkey"
      FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentDepartment_student_company_branch_fkey') THEN
    ALTER TABLE "StudentDepartment" ADD CONSTRAINT "StudentDepartment_student_company_branch_fkey"
      FOREIGN KEY ("studentId", "companyId", "branchId") REFERENCES "StudentProfile"("id", "companyId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentDepartment_department_company_branch_fkey') THEN
    ALTER TABLE "StudentDepartment" ADD CONSTRAINT "StudentDepartment_department_company_branch_fkey"
      FOREIGN KEY ("departmentId", "companyId", "branchId") REFERENCES "Department"("id", "companyId", "branchId") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentActivity_student_company_branch_fkey') THEN
    ALTER TABLE "StudentActivity" ADD CONSTRAINT "StudentActivity_student_company_branch_fkey"
      FOREIGN KEY ("studentId", "companyId", "branchId") REFERENCES "StudentProfile"("id", "companyId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentAdmissionCode_company_branch_fkey') THEN
    ALTER TABLE "StudentAdmissionCode" ADD CONSTRAINT "StudentAdmissionCode_company_branch_fkey"
      FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentStaffAssignment_company_branch_fkey') THEN
    ALTER TABLE "StudentStaffAssignment" ADD CONSTRAINT "StudentStaffAssignment_company_branch_fkey"
      FOREIGN KEY ("companyId", "branchId") REFERENCES "Branch"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'StudentStaffAssignment_department_scope_fkey') THEN
    ALTER TABLE "StudentStaffAssignment" ADD CONSTRAINT "StudentStaffAssignment_department_scope_fkey"
      FOREIGN KEY ("departmentId", "companyId", "branchId") REFERENCES "Department"("id", "companyId", "branchId") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
