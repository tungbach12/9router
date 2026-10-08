// Regression: request logs must never be written inside the Next build tree.
//
// A `npm run build` clears `.next/` at the start. If the running standalone
// server writes per-request captures into `.next/standalone/logs/`, Next's own
// cleanup hits ENOTEMPTY and the build aborts — which deletes `server.js` and
// takes the whole gateway down (PM2 restart-loop → port 20128 dead).
//
// So the logger must resolve its root OUTSIDE the build dir, and must never
// fall back to `process.cwd()` when cwd IS the build dir.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const importFresh = async () => {
  // bust the module cache so LOGGING_ENABLED / LOGS_DIR are re-evaluated
  const url = new URL("../../open-sse/utils/requestLogger.js", import.meta.url).href;
  return import(`${url}?t=${Date.now()}${Math.random()}`);
};

describe("requestLogger log root", () => {
  let tmp;
  let prevCwd;
  let prevDataDir;
  let prevLogs;
  let prevEnabled;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nrouter-logs-"));
    prevCwd = process.cwd();
    prevDataDir = process.env.DATA_DIR;
    prevLogs = process.env.REQUEST_LOG_DIR;
    prevEnabled = process.env.ENABLE_REQUEST_LOGS;
  });

  afterEach(() => {
    process.chdir(prevCwd);
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
    if (prevLogs === undefined) delete process.env.REQUEST_LOG_DIR;
    else process.env.REQUEST_LOG_DIR = prevLogs;
    if (prevEnabled === undefined) delete process.env.ENABLE_REQUEST_LOGS;
    else process.env.ENABLE_REQUEST_LOGS = prevEnabled;
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("never writes captures into the build directory when cwd IS the build dir", async () => {
    const buildDir = path.join(tmp, ".next", "standalone");
    fs.mkdirSync(buildDir, { recursive: true });
    process.chdir(buildDir);
    process.env.ENABLE_REQUEST_LOGS = "true";

    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "test-model");

    // the session must land outside buildDir
    expect(logger.sessionPath).toBeTruthy();
    expect(logger.sessionPath.startsWith(buildDir + path.sep)).toBe(false);
  });

  it("honors REQUEST_LOG_DIR when set", async () => {
    const buildDir = path.join(tmp, ".next", "standalone");
    fs.mkdirSync(buildDir, { recursive: true });
    const logRoot = path.join(tmp, "captures");
    process.chdir(buildDir);
    process.env.REQUEST_LOG_DIR = logRoot;
    process.env.ENABLE_REQUEST_LOGS = "true";

    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "test-model");

    expect(logger.sessionPath.startsWith(logRoot + path.sep)).toBe(true);
    expect(fs.existsSync(logRoot)).toBe(true);
  });

  it("defaults the log root to DATA_DIR, not the repo cwd", async () => {
    const buildDir = path.join(tmp, ".next", "standalone");
    fs.mkdirSync(buildDir, { recursive: true });
    const dataDir = path.join(tmp, "data");
    process.chdir(buildDir);
    process.env.DATA_DIR = dataDir;
    process.env.ENABLE_REQUEST_LOGS = "true";

    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "test-model");

    expect(logger.sessionPath.startsWith(dataDir + path.sep)).toBe(true);
  });
});