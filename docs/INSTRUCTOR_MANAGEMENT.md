# Instructor management

Instructor accounts use the existing `User` and `UserInvite` authentication flow. A company administrator sends an invitation; accepting it creates an `INSTRUCTOR` user and a `PENDING_APPROVAL` profile. An administrator must approve the profile before login or protected instructor endpoints are available. Passwords are set by the invitee through the existing invitation flow.

## API

Management endpoints are mounted at `/api/instructors` and require an authenticated company member/root with one of `OWNER`, `SUPER_ADMIN`, `COMPANY_ADMIN`, or `ADMIN`. Company scope is resolved by the existing `companyId` query parameter and company access middleware. The service also enforces the role and company scope.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/instructors` | Invite an instructor (`name`, `email`) |
| GET | `/api/instructors` | List profiles; supports `page`, `limit`, `search`, `status`, `branchId`, `departmentId` |
| GET | `/api/instructors/:instructorId` | Get profile |
| PATCH | `/api/instructors/:instructorId` | Update administrative profile fields |
| PATCH | `/api/instructors/:instructorId/status` | Transition status (`status`, optional `reason`) |
| POST | `/api/instructors/:instructorId/approve` | Approve a pending profile |
| POST | `/api/instructors/:instructorId/reject` | Reject a pending profile |
| GET/POST | `/api/instructors/:instructorId/branches` | Read branch history / link a branch (`branchId`) |
| DELETE | `/api/instructors/:instructorId/branches/:branchId` | End a branch link and its active department links |
| GET/POST | `/api/instructors/:instructorId/departments` | Read department history / link (`branchId`, `departmentId`) |
| DELETE | `/api/instructors/:instructorId/departments/:departmentId?branchId=...` | End a department link |

Self-service endpoints are mounted at `/api/instructor` and require an active authenticated `INSTRUCTOR` account:

| Method | Path | Purpose |
| --- | --- | --- |
| GET/PATCH | `/api/instructor/me` | Read profile / update permitted self-service fields |
| GET | `/api/instructor/me/branches` | Read active branch scopes |
| GET | `/api/instructor/me/departments` | Read active department scopes |
| GET | `/api/instructor/me/students` | Read active students in authorized teaching scope |
| GET | `/api/instructor/me/students/:studentId/activities` | Read activity for an in-scope student |
| GET | `/api/instructor/me/activities` | Read student activity performed by the instructor |

An `InstructorBranch` without department links grants branch-wide teaching scope. Once department links have existed for a branch, teaching scope is limited to its active department links; ending all of them does not widen access. Relationship end operations retain history.

## Schema and migration

The module adds `InstructorProfile`, `InstructorBranch`, and `InstructorDepartment`, plus `INSTRUCTOR`, `InstructorStatus`, and `InstructorRelationshipStatus`. Composite foreign keys enforce company/branch/department agreement. The SQL migration also creates partial unique indexes so historical ended links can coexist with only one active link per pair.

Migration: `20261029010000_add_instructor_management`.

Development, after selecting a development database in `DATABASE_URL`:

```sh
npx prisma migrate dev
npx prisma generate
```

The verified PostgreSQL integration runner requires a dedicated Neon test branch configured through `TEST_DATABASE_URL`, `NEON_API_KEY`, `NEON_PROJECT_ID`, and `NEON_TEST_BRANCH_ID`:

```sh
npm run test:integration
```

For deployment, first review the migration against the target environment, then apply it through the deployment pipeline:

```sh
npm run db:status
npm run db:migrate
```

`db:migrate` runs `prisma migrate deploy`. Do not point `DATABASE_URL` at production during local development or integration testing. No migration was applied as part of this implementation.
