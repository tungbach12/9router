// Captures land on disk for days and were created world-readable with raw
// credentials. Two guarantees:
//   1. sensitive header VALUES are redacted before being written
//   2. capture files/dirs are not group/world readable
//
// The header masking in requestLogger.js was commented out ("keep full token for
// testing"), which turned ENABLE_REQUEST_LOGS=true into a standing credential leak.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SECRET = "sk-ant-api03-REALSECRETVALUE1234567890abcdef";
const importFresh = async () => {
  const url = new URL("../../open-sse/utils/requestLogger.js", import.meta.url).href;
  return import(`${url}?t=${Date.now()}${Math.random()}`);
};

describe("requestLogger redaction + permissions", () => {
  let tmp;
  let logRoot;
  let prevCwd;
  let prevEnv;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nrouter-secrets-"));
    logRoot = path.join(tmp, "logs");
    prevCwd = process.cwd();
    prevEnv = {
      REQUEST_LOG_DIR: process.env.REQUEST_LOG_DIR,
      DATA_DIR: process.env.DATA_DIR,
      ENABLE_REQUEST_LOGS: process.env.ENABLE_REQUEST_LOGS,
    };
    process.env.REQUEST_LOG_DIR = logRoot;
    delete process.env.DATA_DIR;
    process.env.ENABLE_REQUEST_LOGS = "true";
  });

  afterEach(() => {
    process.chdir(prevCwd);
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("never writes the raw secret value into a capture file", async () => {
    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "m");

    logger.logClientRawRequest("/v1/messages", { hi: 1 }, {
      authorization: `Bearer ${SECRET}`,
      "x-api-key": SECRET,
      "content-type": "application/json",
    });

    const file = path.join(logger.sessionPath, "1_req_client.json");
    const raw = fs.readFileSync(file, "utf8");

    expect(raw).not.toContain(SECRET);
    // non-sensitive headers survive intact (masks must not be over-eager)
    expect(raw).toContain("application/json");
  });

  it("redacts authorization and x-api-key values but keeps non-sensitive ones", async () => {
    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "m");

    logger.logClientRawRequest("/v1/messages", {}, {
      authorization: `Bearer ${SECRET}`,
      "x-api-key": SECRET,
      "user-agent": "claude-cli/1.0",
    });

    const data = JSON.parse(fs.readFileSync(path.join(logger.sessionPath, "1_req_client.json"), "utf8"));
    expect(data.headers.authorization).not.toBe(`Bearer ${SECRET}`);
    expect(data.headers["x-api-key"]).not.toBe(SECRET);
    expect(data.headers["user-agent"]).toBe("claude-cli/1.0");
  });

  it("fully masks short sensitive values instead of leaving them raw", async () => {
    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "m");

    logger.logClientRawRequest("/v1/messages", {}, {
      authorization: "Bearer abc",
      "x-api-key": "short-key",
    });

    const data = JSON.parse(fs.readFileSync(path.join(logger.sessionPath, "1_req_client.json"), "utf8"));
    expect(data.headers.authorization).toBe("***");
    expect(data.headers["x-api-key"]).toBe("***");
  });

  it("redacts a Headers instance (iterable, not a plain object)", async () => {
    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "m");

    const headers = new Headers();
    headers.set("x-api-key", SECRET);
    headers.set("content-type", "application/json");

    logger.logClientRawRequest("/v1/messages", {}, headers);

    const raw = fs.readFileSync(path.join(logger.sessionPath, "1_req_client.json"), "utf8");
    expect(raw).not.toContain(SECRET);
    expect(raw).toContain("application/json");
  });

  it("creates the capture dir and files without group/world access", async () => {
    const { createRequestLogger } = await importFresh();
    const logger = await createRequestLogger("claude", "openai", "m");
    logger.logClientRawRequest("/v1/messages", {}, { authorization: `Bearer ${SECRET}` });

    const dirMode = fs.statSync(logger.sessionPath).mode & 0o777;
    const fileMode = fs.statSync(path.join(logger.sessionPath, "1_req_client.json")).mode & 0o777;

    expect(dirMode & 0o077).toBe(0);   // no group/world bits
    expect(fileMode & 0o077).toBe(0);
  });
});