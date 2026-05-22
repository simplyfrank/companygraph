# Tool Integration Review

Full audit of the agent's tool system — RPC methods, tool registry, cloud/local dispatch, coverage gaps, error handling, and consistency.

## Usage

- `/review-tools` — full review (all categories)
- `/review-tools <category>` — single category

Categories: `rpc`, `registry`, `dispatch`, `coverage`, `errors`, `schemas`, `consistency`

## Execution Protocol

1. **Static analysis only** — read source, grep patterns, no modifications
2. Generate structured report with findings and recommendations
3. Write report to `~/.claude-relay/tool-review-YYYY-MM-DD.md`

## Safety Rules

- Read-only: never modify source code
- No network calls: purely static analysis of the codebase

## Report Output

Write report with sections:
1. Executive Summary (issue counts by severity, top priorities)
2. Detailed Findings (per category)
3. Coverage Matrix (what's exposed where)
4. Recommendations (ordered by impact)

Severity levels: CRITICAL, HIGH, MEDIUM, LOW, INFO

---

# Review Categories

## 1. RPC Method Inventory (`rpc`)

Audit all local agent RPC methods for completeness and correctness.

### Steps

1. Read `telegram/src/local/agent.ts` and extract every key in the `methods` object
2. Read `telegram/src/local/agent.ts` `handleRpc()` for special-cased streaming methods (claude_chat, browser_fill_cart, browser_run_skill, browser_execute_flow)
3. For each method, record:
   - Name
   - Parameters accepted (from params destructuring)
   - Return type / shape
   - Timeout (if set via callAgent or internally)
   - Whether it has error handling (try/catch or .catch)
   - Whether it validates input params

### Findings to check

| ID | Check | Severity |
|----|-------|----------|
| RPC-01 | Methods without try/catch (unhandled throws crash dispatch) | HIGH |
| RPC-02 | Methods that accept params but don't validate required fields | MEDIUM |
| RPC-03 | Methods with no timeout protection (could hang forever) | MEDIUM |
| RPC-04 | Dead methods (registered but never called from cloud) | LOW |
| RPC-05 | Missing methods (cloud calls `callAgent("x")` but no handler exists) | HIGH |
| RPC-06 | Methods that spawn subprocesses without timeout/cleanup | MEDIUM |
| RPC-07 | Methods that access filesystem without path validation | MEDIUM |

### How to check RPC-04 and RPC-05

```
# Find all callAgent invocations in cloud code
grep -rn 'callAgent\s*(' telegram/src/cloud/ telegram/src/actions/ telegram/src/briefing/ telegram/src/email*.ts telegram/src/smart*.ts telegram/src/browser/ --include="*.ts"

# Find all agent.call invocations in tool schemas
grep -rn 'agent\.call\s*(' telegram/src/tools/ --include="*.ts"

# Find all method names in agent.ts
grep -n '^\s\+\w\+:\s*async' telegram/src/local/agent.ts
```

Cross-reference the two sets. Any method in cloud calls but not in agent.ts = RPC-05. Any method in agent.ts but never in cloud calls = RPC-04.

---

## 2. Tool Registry Audit (`registry`)

Audit the Anthropic API tool-use registry (`telegram/src/tools/`).

### Steps

1. Read `telegram/src/tools/registry.ts` — understand ToolDefinition interface, registration, getApiTools(), getToolByName()
2. Read `telegram/src/tools/executor.ts` — understand executeTool() retry/error handling
3. Read `telegram/src/tools/prompt-builder.ts` — understand how tools are selected per conversation
4. Read every file in `telegram/src/tools/schemas/` and extract:
   - Tool name
   - Category
   - `requiresAgent` flag
   - `autoAllowed` flag
   - `dangerous` flag
   - `returnsData` flag
   - Whether execute() has error handling
   - Whether execute() has a cloud fallback when agent is offline

### Findings to check

| ID | Check | Severity |
|----|-------|----------|
| REG-01 | Tools with `requiresAgent: true` but no offline error message | MEDIUM |
| REG-02 | Tools with `requiresAgent: false` but no actual cloud fallback in execute() | HIGH |
| REG-03 | Tools marked `dangerous: true` — verify approval flow exists | MEDIUM |
| REG-04 | Tools with `autoAllowed: true` that perform destructive actions | HIGH |
| REG-05 | Tools with stale/incorrect `input_schema` (missing required fields, wrong types) | MEDIUM |
| REG-06 | Tools registered but not included in any category detection in prompt-builder | LOW |
| REG-07 | Duplicate tool names across schema files | CRITICAL |
| REG-08 | Tools missing `maxRetries` for operations known to be flaky (network, mail) | LOW |

---

## 3. Cloud/Local Dispatch (`dispatch`)

Audit how the cloud dispatches work to the local agent and handles results.

### Steps

1. Read `telegram/src/cloud/agent-server.ts` — `callAgent()` function, timeout handling, connection state
2. Search for all `callAgent(` invocations across the codebase
3. For each call site, check:
   - Is the timeout appropriate for the operation?
   - Is the error case handled (agent offline, timeout, RPC error)?
   - Is there a fallback when agent is unavailable?
   - Are streaming calls properly cleaned up on disconnect?

### Findings to check

| ID | Check | Severity |
|----|-------|----------|
| DSP-01 | callAgent() calls with no error handling (await without try/catch) | HIGH |
| DSP-02 | callAgent() calls with inappropriate timeout (too short for mail, too long for status) | MEDIUM |
| DSP-03 | No fallback for critical operations when agent is offline | HIGH |
| DSP-04 | Streaming calls (claude_chat, browser) without disconnect cleanup | MEDIUM |
| DSP-05 | Race conditions: multiple concurrent callAgent() to same method | LOW |
| DSP-06 | callAgent() in scheduler jobs without checking agent connection first | MEDIUM |

---

## 4. Coverage Analysis (`coverage`)

Map what capabilities exist at each layer and identify gaps.

### Steps

1. Build a matrix of all capabilities across these layers:
   - Local agent RPC methods (`methods` object)
   - Tool registry schemas (`tools/schemas/*.ts`)
   - Chat commands (`chat-commands.ts` — `<<<COMMAND` parsing)
   - Telegram bot commands (`actions/*.ts`)
   - REST API endpoints (`webapp-server.ts`)
   - PWA views (`pwa/views/*.js`)

2. For each capability, check which layers expose it:

```
| Capability       | RPC | Tool | Chat Cmd | Telegram | REST | PWA |
|------------------|-----|------|----------|----------|------|-----|
| Calendar today   |  Y  |  Y   |    Y     |    -     |  Y   |  -  |
| Mail read        |  Y  |  Y   |    Y     |    Y     |  Y   |  Y  |
| Focus set        |  Y  |  Y   |    Y     |    Y     |  Y   |  -  |
| ...              |     |      |          |          |      |     |
```

### Findings to check

| ID | Check | Severity |
|----|-------|----------|
| COV-01 | RPC methods with no corresponding tool registry entry (Claude can't use them via tool-use) | MEDIUM |
| COV-02 | Tool registry entries with no corresponding chat command (Claude can't use them in `<<<COMMAND` mode) | LOW |
| COV-03 | Telegram commands with no REST API equivalent (PWA can't access) | MEDIUM |
| COV-04 | REST endpoints with no PWA view (functionality not exposed in UI) | LOW |
| COV-05 | Capabilities only accessible via one layer (single point of failure) | INFO |

---

## 5. Error Handling (`errors`)

Audit error handling patterns across the tool system.

### Steps

1. In `tools/executor.ts`, check retry logic:
   - What errors trigger retry vs. immediate failure?
   - Is there exponential backoff?
   - Are retries logged?
2. In `tools/schemas/*.ts`, check execute() implementations:
   - Do they catch and wrap errors consistently?
   - Do they return `{ isError: true }` with useful messages?
   - Do they handle partial results?
3. In `local/agent.ts`, check method implementations:
   - Do they catch errors from subprocess calls?
   - Do they clean up resources on failure?
   - Do they return structured error objects?
4. In `cloud/agent-server.ts`, check dispatch error handling:
   - How are timeouts surfaced to callers?
   - How are agent disconnects handled mid-call?

### Findings to check

| ID | Check | Severity |
|----|-------|----------|
| ERR-01 | Tool execute() that throws instead of returning `{ isError: true }` | HIGH |
| ERR-02 | Missing timeout on agent calls that could hang (mail operations, browser) | HIGH |
| ERR-03 | Error messages that leak internal paths or secrets | MEDIUM |
| ERR-04 | Retry logic that could amplify failures (no backoff, no jitter) | MEDIUM |
| ERR-05 | Swallowed errors (catch with no logging or re-throw) | MEDIUM |
| ERR-06 | Inconsistent error shapes between RPC, tool registry, and REST | LOW |

---

## 6. Schema Validation (`schemas`)

Audit tool input schemas for correctness and security.

### Steps

1. For each tool in `tools/schemas/*.ts`, read the `input_schema` object
2. Verify:
   - Required fields are marked as required
   - Enum values match what the execute() function actually handles
   - String fields that accept paths have no traversal protection (flag if used in file ops)
   - No unbounded array/string fields that could cause memory issues

### Findings to check

| ID | Check | Severity |
|----|-------|----------|
| SCH-01 | Schema allows values that execute() doesn't handle (missing enum members, wrong types) | MEDIUM |
| SCH-02 | Schema missing `required` for fields that execute() assumes exist | HIGH |
| SCH-03 | Path-type fields without traversal validation in execute() | HIGH |
| SCH-04 | Missing `maxLength` or `maxItems` on string/array fields | LOW |
| SCH-05 | Schema description too vague for Claude to use effectively | LOW |
| SCH-06 | Schema `description` inconsistent with actual behavior | MEDIUM |

---

## 7. Consistency Check (`consistency`)

Cross-cutting checks for consistency across the tool system.

### Steps

1. Compare method names:
   - RPC method names vs tool registry names vs chat command names
   - Flag inconsistent naming (e.g., `mail_read` RPC vs `mail_list` tool vs `/emails` command)
2. Compare parameter names:
   - Same logical parameter called different names across layers
3. Compare return shapes:
   - Same data returned in different formats across layers
4. Check for duplicate implementations:
   - Same logic implemented independently in multiple places (drift risk)

### Findings to check

| ID | Check | Severity |
|----|-------|----------|
| CON-01 | Naming mismatches between layers for same capability | LOW |
| CON-02 | Same parameter called different names across RPC/tool/REST | LOW |
| CON-03 | Duplicate logic that could drift (e.g., calendar formatting in agent + tool + REST) | MEDIUM |
| CON-04 | Inconsistent behavior for same operation across layers | HIGH |
| CON-05 | Tool descriptions that don't match RPC behavior | MEDIUM |

---

## Execution Checklist

When running a full review:

1. [ ] Read key source files:
   - `telegram/src/local/agent.ts` (methods object + handleRpc)
   - `telegram/src/tools/registry.ts`
   - `telegram/src/tools/executor.ts`
   - `telegram/src/tools/prompt-builder.ts`
   - All files in `telegram/src/tools/schemas/`
   - `telegram/src/cloud/agent-server.ts` (callAgent function)
   - `telegram/src/chat-commands.ts` (COMMAND parsing)

2. [ ] Grep for cross-references:
   - All `callAgent(` invocations
   - All `agent.call(` invocations
   - All `registry.register(` calls
   - All `methods[` or `methods.` references

3. [ ] Build the coverage matrix

4. [ ] Generate findings with:
   - ID (e.g., RPC-01)
   - Severity
   - File path + line number
   - Description
   - Recommendation

5. [ ] Write report to `~/.claude-relay/tool-review-YYYY-MM-DD.md`

6. [ ] Print summary to chat:
   - Total findings by severity
   - Top 5 priorities
   - Coverage gaps count
