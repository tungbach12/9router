# 9Router Custom Patches

Tài liệu lưu trữ các bản vá nội bộ (custom patches) được duy trì trên nhánh `master` của 9Router so với upstream `decolua/9router`.

---

## 1. Patch 1: AgentRouter WAF Spoofing (Claude CLI Fingerprint)

* **Mục đích:**
  Vượt qua Cloudflare WAF của gateway `agentrouter.org`. WAF này chặn các request không mang fingerprint chính thức của Claude Code CLI (`401 Unauthorized` / `405 Method Not Allowed`).
* **Cơ chế:**
  Tự động gắn bộ headers chuẩn `CLAUDE_CLI_SPOOF_HEADERS` (User-Agent `claude-cli/2.1.288`, `anthropic-beta` với các cờ `claude-code-20250219`, `x-app: cli`,...) khi gọi tới các endpoint của `agentrouter.org`.
* **Các file can thiệp:**
  1. `open-sse/executors/default.js`:
     Inject `CLAUDE_CLI_SPOOF_HEADERS` khi `spoofClaudeHeaders === true && baseUrl.includes("agentrouter.org")` trong `DefaultExecutor.buildHeaders()`.
  2. `src/app/api/providers/[id]/models/route.js`:
     Inject `CLAUDE_CLI_SPOOF_HEADERS` khi thực hiện truy vấn danh sách `/models` từ AgentRouter.
  3. `src/app/api/providers/validate/route.js`:
     Inject `CLAUDE_CLI_SPOOF_HEADERS` trong payload kiểm tra API key (validate probe) tới `/v1/messages`.

---

## 2. Patch 2: Antigravity/Gemini Schema Property Collision Fix (2026-10-03)

* **Mục đích:**
  Khắc phục lỗi HTTP `400 INVALID_ARGUMENT` từ Google Cloud AI Platform / Vertex AI API:
  ```json
  "Invalid value at 'request.tools[0].function_declarations[...].parameters.properties[...].value' (type.googleapis.com/google.cloud.aiplatform.master.Schema), \"object\""
  ```
* **Hiện tượng:**
  Khi client (như Claude Code) truyền các công cụ MCP có tham số tên là `properties` (ví dụ `mcp__plugin_atlassian_atlassian__getJiraIssue`), gọi qua Antigravity (`gemini-3.8-flash-high`) sẽ bị Google từ chối do schema không hợp lệ.
* **Nguyên nhân gốc:**
  Hàm `ensureObjectType()` trong `open-sse/translator/formats/gemini.js` duyệt đệ quy `Object.values(obj)`. Khi duyệt tới dictionary danh sách tham số `schema.properties`, nếu trong danh sách này có một tham số mang tên `"properties"`, điều kiện `if (obj.properties && !obj.type)` bị đánh giá thành `true`. Hàm lập tức gán `obj.type = "object"`, khiến một trường `type: "object"` bị chèn thẳng vào dictionary tham số. Google Vertex AI Protobuf Parser yêu cầu mọi value trong map `parameters.properties` phải là một `Schema` object, nhưng lại nhận được chuỗi `"object"` nên trả về 400.
* **Giải pháp khắc phục:**
  Tái cấu trúc hàm `ensureObjectType()`:
  - Chỉ gán `type = "object"` khi đối tượng là schema object hợp lệ chứa trường `properties`.
  - Duyệt đệ quy chính xác vào các schema con (`Object.values(obj.properties)`, `obj.items`, `anyOf`, `oneOf`, `allOf`), không duyệt `Object.values(obj)` thô khiến dictionary `properties` bị coi là một schema.
* **Các file can thiệp:**
  1. `open-sse/translator/formats/gemini.js`: Cập nhật logic hàm `ensureObjectType()`.
  2. `tests/translator/bugs-antigravity.test.js`: Thêm unit test kiểm tra regression với tool chứa tham số `properties`.

## 3. Patch 3: Responses API Tool Name Compatibility (`default.*`)

* **Phạm vi:** Chỉ quy tắc tên tool; độc lập với Patch 4 (arguments streaming). Revert riêng bằng cách bỏ các thay đổi trong các file dưới đây, không revert Patch 1/2.
* **Nguyên nhân:** OpenAI Responses API chấp nhận tool name theo `^[a-zA-Z0-9_-]+$`; tên có namespace như `default.Bash`/`default.Read` bị HTTP 400 nếu chuyển nguyên trạng. Phản hồi có thể lặp namespace mà Claude Code không nhận diện được.
* **Thay đổi:** `sanitizeResponsesToolName()` chuẩn hóa ký tự không hợp lệ/giới hạn độ dài khi dựng request; nhánh response loại tiền tố namespace giả trước khi trả tên tool về client.
* **Files:** `open-sse/translator/formats/responsesApi.js`; `open-sse/translator/request/openai-responses.js`; `open-sse/translator/response/openai-responses.js`; `open-sse/translator/response/openai-to-claude.js`.
* **Tests:** `tests/unit/openai-responses-multiturn.test.js` (sanitization) và `tests/unit/openai-to-claude-response-tools.test.js` (response mapping). Không bao gồm bản vá arguments bên dưới.
* **Revert:** Hoàn nguyên diff của đúng bốn source files và hai test files trên; giữ riêng Patch 1, Patch 2 và Patch 4.

---

## 4. Patch 4: Responses API Tool Arguments Completion (Read/Grep)

* **Phạm vi:** Chỉ streaming arguments; độc lập với Patch 3. Nhắm route Claude Code → 9Router → OpenCode Free / Muse Spark Responses API.
* **Bằng chứng gốc:** Trong captured Muse Spark SSE có event `response.function_call_arguments.done` chứa `"{}"`, tiếp theo `response.output_item.done` có `arguments:""`; client trace cho thấy Claude Code sinh Read/Grep tool call với input `{}`. Khi upstream gửi delta/arguments thật, trace cho thấy các trường `path`/`pattern` được chuyển qua. Vì vậy `{}` hoàn toàn do upstream không tạo arguments ở các request đó; router không thể suy ra path/pattern an toàn.
* **Translator gap được vá:** Trước vá, event `.arguments.done` không được xử lý; `{}` được defer để chờ `output_item.done`, nhưng nhánh done bỏ qua chuỗi rỗng, làm mất dấu arguments và không emit payload. Bản sửa ghi nhớ placeholder `{}` và chỉ emit làm fallback tại `output_item.done` nếu không có arguments hữu ích nào tới sau. Arguments đầy đủ ở `.done`/`output_item.done` được giữ; delta đã phát không bị lặp.
* **Files:** `open-sse/translator/response/openai-responses.js`; `tests/unit/responses-parallel-tool-calls.test.js`.
* **Tests:** Covers populated arguments in `.arguments.done`, empty placeholder followed by populated `output_item.done`, and placeholder `{}` with empty final `output_item.done`; plus existing parallel-call regression.
* **Interpretation:** Patch 4 prevents translator data loss and forwards `{}` faithfully when that's all upstream sends. It cannot make Claude execute Read/Grep successfully when Muse Spark itself omits required inputs. Such a run is an upstream malformed tool call, not evidence that the router can recover missing arguments.
* **Revert:** Revert only the Patch 4 hunks in the translator and test file. Do not revert Patch 3 or the two established patches.

---

## Patch comparison and independent rollback map

| Patch | Purpose | Source files | Regression tests | Independent rollback |
|---|---|---|---|---|
| 1 | AgentRouter WAF headers | `open-sse/executors/default.js`; `src/app/api/providers/[id]/models/route.js`; `src/app/api/providers/validate/route.js` | Existing provider tests | Revert only Patch 1 hunks |
| 2 | Gemini schema `properties` collision | `open-sse/translator/formats/gemini.js` | `tests/translator/bugs-antigravity.test.js` | Revert only Patch 2 hunks |
| 3 | Responses tool-name regex/namespace | `responsesApi.js`; request/response translators | Responses name tests | Revert only Patch 3 hunks |
| 4 | Responses tool arguments completion | `openai-responses.js` | `responses-parallel-tool-calls.test.js` | Revert only Patch 4 hunks |

* **Upstream baseline:** The first two patches are the previously maintained custom patches; Patches 3 and 4 are separate Responses API additions. Compare each patch's listed source hunks to upstream `decolua/9router` independently; do not describe unrelated working-tree files as part of these patches.
* **Current verification status:** Patch 3/4 focused tests last run: 19 passing after Patch 4's empty-arguments regression was corrected. Production build/deployment status must be recorded only after the current build and live service verification finish.

---
*Updated: 2026-10-04*
