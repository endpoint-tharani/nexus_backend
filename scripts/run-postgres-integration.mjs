import "dotenv/config";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fail, IntegrationValidationError, validateNeonBranch } from "./neon-test-branch.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseDatabaseUrl(value, variableName) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${variableName} is not a valid PostgreSQL URL.`);
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    fail(`${variableName} must use PostgreSQL.`);
  }
  const databaseName = decodeURIComponent(url.pathname.split("/").filter(Boolean).at(-1) ?? "");
  if (!url.hostname || !databaseName) fail(`${variableName} must include a hostname and database name.`);
  return { url, host: url.hostname.toLowerCase(), port: url.port || "5432", databaseName };
}

function sameDatabase(first, second) {
  return first.host === second.host && first.port === second.port && first.databaseName === second.databaseName;
}

async function neonGet(apiKey, apiPath) {
  const response = await fetch(`https://console.neon.tech/api/v2${apiPath}`, {
    headers: { authorization: `Bearer ${apiKey}`, accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 404) {
      throw new Error("Neon returned 404 for the configured project/branch. Verify NEON_PROJECT_ID and NEON_TEST_BRANCH_ID in the Neon Console; use the branch ID (not its name) from that same project, and confirm NEON_API_KEY can access it.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Neon returned HTTP ${response.status}; verify that NEON_API_KEY is valid and has access to NEON_PROJECT_ID.`);
    }
    throw new Error(`Neon API returned HTTP ${response.status} for branch verification.`);
  }
  return response.json();
}

async function verifyNeonTestBranch(testDb) {
  const apiKey = process.env.NEON_API_KEY?.trim();
  const projectId = process.env.NEON_PROJECT_ID?.trim();
  const expectedBranchId = process.env.NEON_TEST_BRANCH_ID?.trim();
  if (!apiKey || !projectId || !expectedBranchId) {
    fail("Neon branch verification requires NEON_API_KEY, NEON_PROJECT_ID, and NEON_TEST_BRANCH_ID.");
  }
  if (process.env.ALLOW_NEON_TEST_BRANCH?.trim() !== "true") {
    fail("Set ALLOW_NEON_TEST_BRANCH=true to opt in to verified Neon test-branch migrations.");
  }

  let branchResult;
  let endpointsResult;
  try {
    const project = encodeURIComponent(projectId);
    const branch = encodeURIComponent(expectedBranchId);
    branchResult = await neonGet(apiKey, `/projects/${project}/branches/${branch}`);
  } catch (error) {
    fail(`Could not verify the intended Neon test branch: ${error instanceof Error ? error.message : "Neon API request failed"}`);
  }
  const branch = branchResult.branch ?? branchResult;
  try {
    const project = encodeURIComponent(projectId);
    const branchId = encodeURIComponent(expectedBranchId);
    endpointsResult = await neonGet(apiKey, `/projects/${project}/branches/${branchId}/endpoints`);
  } catch (error) {
    fail(`Could not retrieve endpoints for the intended Neon test branch: ${error instanceof Error ? error.message : "Neon API request failed"}`);
  }
  const verification = validateNeonBranch({
    branch,
    endpoints: endpointsResult.endpoints,
    projectId,
    branchId: expectedBranchId,
    testHost: testDb.host,
  });
  return { branchName: verification.branchName, endpointHost: verification.endpointHost };
}

function runNode(script, args, env) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) throw new Error(`Failed to start ${path.basename(script)}: ${result.error.message}`);
  return result.status ?? 1;
}

async function main() {
const testUrl = process.env.TEST_DATABASE_URL?.trim();
const primaryUrl = process.env.DATABASE_URL?.trim();
if (!testUrl) fail("Set TEST_DATABASE_URL to the dedicated Neon test-branch URL.");
if (!primaryUrl) fail("DATABASE_URL is required to compare against the application database.");

const testDb = parseDatabaseUrl(testUrl, "TEST_DATABASE_URL");
const primaryDb = parseDatabaseUrl(primaryUrl, "DATABASE_URL");
if (sameDatabase(testDb, primaryDb)) fail("TEST_DATABASE_URL targets the same host, port, and database as DATABASE_URL.");
if (!testDb.host.endsWith(".neon.tech")) fail("TEST_DATABASE_URL must target a Neon endpoint verified through the Neon API.");
if (!process.env.AUTH_OTP_PEPPER?.trim() && !process.env.AUTH_ACCESS_TOKEN_SECRET?.trim()) {
  fail("Set AUTH_OTP_PEPPER (preferred) or AUTH_ACCESS_TOKEN_SECRET for persistent OTP tests.");
}

const verified = await verifyNeonTestBranch(testDb);
console.log(`Verified Neon test branch '${verified.branchName}' and endpoint host '${verified.endpointHost}'.`);

const env = {
  ...process.env,
  DATABASE_URL: testUrl,
  TEST_DATABASE_URL: testUrl,
  STUDENT_INTEGRATION_SAFE: "1",
};
// Neon pooled endpoints are suitable for application queries, but Prisma
// migrations need the branch's direct compute endpoint. Use the hostname
// returned by the already-verified Neon branch API, keeping all URL credentials
// and database parameters bound to TEST_DATABASE_URL.
const migrationUrl = new URL(testUrl);
migrationUrl.hostname = verified.endpointHost;
const migrationEnv = { ...env, DATABASE_URL: migrationUrl.toString() };
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
const vitestCli = path.join(root, "node_modules", "vitest", "vitest.mjs");
const reportDirectory = mkdtempSync(path.join(os.tmpdir(), "student-integration-"));
const reportPath = path.join(reportDirectory, "vitest-report.json");
let retainReport = false;

try {
  console.log(`\nApplying pending Prisma migrations through verified direct endpoint '${verified.endpointHost}'...`);
  const migrationStatus = runNode(prismaCli, ["migrate", "deploy"], migrationEnv);
  if (migrationStatus !== 0) throw new Error(`Prisma migrate deploy exited with status ${migrationStatus}.`);

  console.log("\nRunning student-management PostgreSQL integration tests...");
  const vitestStatus = runNode(vitestCli, [
    "run",
    "tests/studentManagement.integration.test.ts",
    "tests/instructorManagement.integration.test.ts",
    "--testTimeout=60000",
    "--hookTimeout=60000",
    "--reporter=json",
    `--outputFile=${reportPath}`,
  ], env);

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch {
    retainReport = true;
    console.error(`Vitest exited with status ${vitestStatus}; report is unavailable at ${reportPath}.`);
    fail("Vitest did not produce a readable JSON report; refusing to report success.");
  }
  const total = report.numTotalTests ?? 0;
  const passed = report.numPassedTests ?? 0;
  const skipped = report.numPendingTests ?? 0;
  const failed = report.numFailedTests ?? 0;
  console.log(`Integration result: ${passed} passed, ${failed} failed, ${skipped} skipped, ${total} total.`);
  if (failed > 0 || vitestStatus !== 0) {
    retainReport = true;
    const failures = (report.testResults ?? []).flatMap((file) =>
      (file.assertionResults ?? [])
        .filter((test) => test.status === "failed")
        .map((test) => ({ title: test.fullName ?? test.title ?? "unnamed test", messages: test.failureMessages ?? [] })),
    );
    for (const failure of failures) {
      console.error(`\nFAILED: ${failure.title}`);
      for (const message of failure.messages) console.error(message);
    }
    console.error(`Full Vitest JSON report retained at ${reportPath}`);
    process.exitCode = 1;
    return;
  }
  if (total === 0 || passed === 0 || skipped === total) {
    retainReport = true;
    console.error(`Full Vitest JSON report retained at ${reportPath}`);
    process.exitCode = 1;
    console.error("Integration run did not execute and pass at least one test; refusing success.");
  } else {
    console.log("Student-management integration tests completed successfully.");
  }
} finally {
  if (!retainReport) rmSync(reportDirectory, { recursive: true, force: true });
}
}

main().catch((error) => {
  if (error instanceof IntegrationValidationError) {
    console.error(`Refusing integration tests: ${error.message}`);
    console.error("No database command was executed by this runner.");
    process.exitCode = 2;
    return;
  }
  console.error(error instanceof Error ? error.message : "Integration runner failed.");
  process.exitCode = 1;
});
