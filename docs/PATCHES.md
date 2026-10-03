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

---
*Cập nhật lần cuối: 2026-10-03*
