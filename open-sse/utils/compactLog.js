// Compact log module — reduces verbose multi-line logs to readable single-line format.
// Icons are always paired with a text label for clarity.

function ts() {
  return new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function ms(s) { return `${(s / 1000).toFixed(1)}s`; }
function kb(b) { return b > 1024 ? `${(b / 1024).toFixed(1)}KB` : `${b}B`; }
function short(s, n = 12) { return s && s.length > n ? s.slice(0, n) + "..." : s || ""; }

// [REQ] claude-haiku-4-5 | 11 msgs | 49 tools | api: sk-f...UOxL
export function logRequest(alias, model, msgCount, toolCount, apiKey) {
  const key = apiKey ? `api: ${apiKey.slice(0, 5)}...${apiKey.slice(-4)}` : "";
  console.log(`[${ts()}] 📥 REQ | ${alias}/${model} | ${msgCount} msgs | ${toolCount} tools | ${key}`);
}

// [ROUTING] combo(6, fallback) → kilocode/step-3.7-flash:free | claude→openai | 35 msgs
export function logRouting(comboName, comboCount, strategy, targetProvider, targetModel, sourceFmt, targetFmt, msgCount) {
  const combo = comboName ? `${comboName}(${comboCount}, ${strategy})` : `direct`;
  console.log(`[${ts()}] 🔄 ROUTING | ${combo} → ${targetProvider}/${targetModel} | ${sourceFmt}→${targetFmt} | ${msgCount} msgs`);
}

// [FETCH] → api.kilo.ai/api/openrouter/chat/completions | 184KB
export function logFetch(provider, url, bodySize) {
  let host = url;
  try { host = new URL(url).hostname + new URL(url).pathname; } catch {}
  console.log(`[${ts()}] 🚀 FETCH | ${provider} → ${host} | ${kb(bodySize)}`);
}

// [RESP] 200 | ttft=7.1s | 22 chunks | 7.5KB | 1.4s
export function logResponse(provider, status, ttftMs, chunkCount, totalBytes, durationMs) {
  const ttft = ttftMs > 0 ? `ttft=${ms(ttftMs)}` : "";
  const chunks = chunkCount > 0 ? `${chunkCount} chunks` : "";
  const size = totalBytes > 0 ? kb(totalBytes) : "";
  const dur = durationMs > 0 ? ms(durationMs) : "";
  const parts = [status, ttft, chunks, size, dur].filter(Boolean).join(" | ");
  console.log(`[${ts()}] ✅ RESP | ${provider} | ${parts}`);
}

// [STREAM] complete | 22 chunks | 7.5KB | 1.4s
export function logStreamComplete(provider, chunkCount, totalBytes, durationMs) {
  console.log(`[${ts()}] ✅ STREAM | ${provider} | ${chunkCount} chunks | ${kb(totalBytes)} | ${ms(durationMs)}`);
}

// [USAGE] in=49486 | out=314 | cache=0 | account=52f55278
export function logUsage(provider, inTokens, outTokens, cacheTokens, accountId) {
  const cache = cacheTokens > 0 ? `cache=${cacheTokens}` : "";
  const account = accountId ? `account=${short(accountId, 8)}` : "";
  const parts = [`in=${inTokens}`, `out=${outTokens}`, cache, account].filter(Boolean).join(" | ");
  console.log(`[${ts()}] 💰 USAGE | ${provider} | ${parts}`);
}

// [COMPLETE] claude-haiku-4-5 → kilocode/step-3.7-flash:free | 8.5s | 200 | out=314
export function logComplete(alias, model, provider, targetModel, durationMs, status, outTokens) {
  const dur = ms(durationMs);
  const tokens = outTokens > 0 ? `out=${outTokens}` : "";
  console.log(`[${ts()}] 🏁 DONE | ${alias}/${model} → ${provider}/${targetModel} | ${dur} | ${status} | ${tokens}`);
}

// [ERROR] full detail — always verbose
export function logError(provider, model, status, message, details = {}) {
  console.log(`\n[${ts()}] ❌ ERROR | ${provider}/${model} | ${status}`);
  if (details.url) console.log(`    url: ${details.url}`);
  if (details.request) console.log(`    request: ${details.request}`);
  if (message) console.log(`    message: ${message}`);
  if (details.response) console.log(`    response: ${typeof details.response === "string" ? details.response : JSON.stringify(details.response).slice(0, 500)}`);
  if (details.headers) console.log(`    headers: ${JSON.stringify(details.headers)}`);
  if (details.account) console.log(`    account: ${details.account}`);
  if (details.retry !== undefined) console.log(`    retry: ${details.retry}`);
  if (details.lockedUntil) console.log(`    locked until: ${details.lockedUntil}`);
  if (details.bodySize) console.log(`    body: ${kb(details.bodySize)}`);
  if (details.ttft) console.log(`    ttft: ${ms(details.ttft)}`);
  console.log("");
}

// [STALL] full detail — always verbose
export function logStall(provider, model, timeoutMs, lastChunkGapMs, chunkCount, totalBytes, durationMs) {
  console.log(`\n[${ts()}] ⚠️ STALL | ${provider}/${model}`);
  console.log(`    timeout: ${ms(timeoutMs)} | last chunk: ${ms(lastChunkGapMs)} ago`);
  console.log(`    chunks: ${chunkCount} | bytes: ${kb(totalBytes)} | duration: ${ms(durationMs)}`);
  console.log("");
}

// [COMBO] try 1/6: kilocode/step-3.7-flash:free
export function logComboTry(index, total, modelStr) {
  console.log(`[${ts()}] 🔄 COMBO | try ${index}/${total}: ${modelStr}`);
}

// [COMBO] model succeeded
export function logComboSuccess(modelStr) {
  console.log(`[${ts()}] ✅ COMBO | ${modelStr} succeeded`);
}

// [COMBO] model failed, trying next
export function logComboFail(modelStr, status, error) {
  const detail = error ? ` | ${error}` : ` | ${status}`;
  console.log(`[${ts()}] ❌ COMBO | ${modelStr} failed${detail}`);
}

// [TOKEN] refresh skipped (no refresh token)
export function logTokenSkip(provider, status) {
  console.log(`[${ts()}] 🔑 TOKEN | ${provider} | ${status} | no refresh token`);
}

// [AUTH] debug — only in debug mode
export function logAuthDebug(provider, headers) {
  if (process.env.LOG_LEVEL?.toUpperCase() === "DEBUG") {
    console.log(`[${ts()}] 🔑 AUTH_DEBUG | ${provider} | ${JSON.stringify(headers)}`);
  }
}

// [PENDING] start/end — only in debug mode
export function logPending(status, provider, model) {
  console.log(`[${ts()}] ⏳ PENDING | ${status} | ${provider}/${model}`);
}
