# Automation Workflows — User Guide

**Audience:** you, the operator of this repo, driving work through Claude Code.
**Companion docs:** [`.claude/CLAUDE.md`](CLAUDE.md) (architecture — *how it's built*), [`.claude/patterns/README.md`](patterns/README.md) (conventions — *how code is shaped*). **This file is *how you get work done* — intent → the right workflow → the gates → what it chains into.**

---

## 1. The golden rule: state intent, don't memorize commands

Every automation here is a **skill** (a `/command`) or an **agent** (a delegated worker). You do **not** need to remember which one. Two equivalent ways to start any workflow:

1. **Say what you want in plain language.** "Apply the design that just landed", "ship a fix for the calendar sync bug", "what's broken in prod right now?". Claude Code matches your intent to the right skill and tells you which one it's invoking before it acts.
2. **Type the slash command** if you already know it (`/design-apply ingest`, `/spec new …`, `/debug-cloud`).

Both routes converge on the same skill. The slash form is just a shortcut for an intent you can already name. **If a skill matches your request, it is invoked *before* any other response** — so the gates below always fire.

> **Why intent-first works:** skills carry trigger descriptions (e.g. `routine` says "Use ONLY when the user explicitly types `/routine`"; `claude-api` says "TRIGGER when code imports `anthropic`"). Claude reads these and routes. You describe the destination; the system picks the road.

---

## 2. The mental model — four layers

```
   YOUR INTENT
        │
        ▼
   SKILLS  ───────────  the workflows you invoke (/command). Gated, opinionated,
        │                proactive. ~50 of them. This doc's main subject.
        ▼
   AGENTS  ───────────  workers a skill (or you) delegates to. Two kinds:
        │                · Claude Code subagents (Explore / Plan / general-purpose)
        │                  — spawned during a coding session for fan-out work.
        │                · Product runtime subagents (email / calendar / task /
        │                  research / finance) — invoked via /delegate or pipelines.
        ▼
   PATTERNS  ─────────  the code shapes a skill must follow when it writes code.
        │                You rarely touch these directly; skills consult them.
        ▼
   SPECS  ────────────  durable plans for multi-phase features, under .claude/specs/.
                         Created/driven by /spec. The audit trail of intent.
```

**Rule of thumb:** trivial change → just ask. Recurring shaped task → there's a skill. Multi-phase feature → it becomes a spec. Broad search or N independent jobs → it becomes agents.

---

## 3. The intent router

Find your intent in the left column. That's your entrypoint. The chain column shows what it pulls in automatically — you don't invoke those yourself.

### Building & changing the product

| I want to… | Start with | Chains into | Gate(s) |
|---|---|---|---|
| Plan a whole app / large subsystem | `/spec-app <idea>` | decompose → `blueprint.md` → parallel fan-out of one `/spec` pipeline per feature (via `.claude/workflows/spec-app.js`) | human gates the **decomposition** + the **final plan**; per-feature reviews gate autonomously |
| Build a non-trivial feature | `/spec new <feature>` | clarifying Qs → requirements → design → tasks → impl; may call `/component`, `/tdd`, `/test` | Approve/Revise/Reject at every phase (proactive) |
| Apply a design dropped in `docs/design/` | `/design-apply ingest` → `plan` → `apply` | `/component`, `/add-pwa-view`, `/stitch`, `/review-ui` + the conformance gate | per-surface conformance (hard) + human review (never self-approved) |
| Add a new PWA screen/route | `/add-pwa-view` (or `/design-apply` if from a design drop) | `/component new` for any missing primitive | CATALOG check before markup |
| Add/extend/migrate a shared UI component | `/component new\|extend\|migrate\|extract` | storybook scaffold, CATALOG row | framework-Storybook review gate |
| Generate UI variants via Stitch | `/stitch generate-*` / `tokens-sync` | token sync to `pwa/src/styles/companygraph/tokens.css` | "show assembled prompt before sending" |
| Audit one view's visual quality | `/review-ui <view>` | screenshots + scorecard (read-only) | none (report only) |
| Add a Telegram command / scheduler job / memory module | `/add-command` · `/add-scheduler-job` · `/add-memory-module` | the matching pattern doc | pattern acceptance checklist |
| Write tests for a module | `/test <module>` (or `/tdd` to go test-first) | correct mock/db-isolation setup | `/tdd`: failing tests approved before impl |
| Clean up / restructure code safely | `/refactor` | `/simplify` for changed-code review | behavior-preserving checks |

### Shipping

| I want to… | Start with | Chains into | Gate(s) |
|---|---|---|---|
| Commit a session's work in logical groups | `/commit-sequence` | conventional-commit messages, git hooks | pre-commit transpile / pre-push validation |
| Deploy | `/deploy` (= push to `main`) | CI/CD: Build → DeployStaging → SmokeTest → **ApproveProd** → PromoteProd | **manual prod approval via Telegram** |
| Work on >1 file / run parallel sessions | start a **git worktree** first (see CLAUDE.md "Parallel sessions") | branch + PR + merge | direct push to `main` reserved for 1-line fixes |
| Push spec tasks to GitHub backlog | `/plan` · `/sync-backlog` · `/issue-sync` | GitHub Issues + project board | — |

### Operating, diagnosing, reviewing

| I want to… | Start with | Notes |
|---|---|---|
| See system state | `/status` | running apps, focus, mail, DND, volume |
| Diagnose the EC2 cloud bot | `/debug-cloud` | logs/health/DB via SSM (SSH is break-glass) |
| Architecture audit of a feature | `/review-feature <feature>` | scored against this codebase's 10 well-architected pillars |
| Audit the tool/RPC integration surface | `/review-tools` | RPC + registry + dispatch + coverage gaps |
| Security review of pending changes | `/security-review` | branch diff; defensive |
| Authorized pen-test / CTF | `/pentest` | white-hat only |

### Daily life & the personal-assistant domains

| I want to… | Skill |
|---|---|
| Start/end my day, weekly review | `/morning` · `/evening` · `/weekly` (or `/routine <which>`) |
| Focus / window layout / app groups / system toggles | `/focus` · `/unfocus` · `/layout` · `/launch` · `/quick` |
| Money | `/expense` (quick log) · `/finance` (dashboard, budgets, FX) |
| Travel | `/flight` · (trip planning via the trip MCP tools) |
| Knowledge & buying | `/research <topic>` · `/buy <product>` · `/hn` |
| People & messaging | `/contacts` · `/reminders` · `/whatsapp` · `/telegram` |
| Roadmap | `/board` |

### Meta — automating the automation

| I want to… | Skill |
|---|---|
| Run something on a recurring interval, this session | `/loop [interval] <command>` |
| Schedule a remote agent on a cron / one-shot future run | `/schedule` |
| Change harness behavior (hooks, permissions, env, "whenever X do Y") | `/update-config` |
| Customize keyboard shortcuts | (ask — keybindings skill) |
| Reduce permission prompts | `/fewer-permission-prompts` |
| Fan N independent jobs to N agents | `/parallel-agents` |

---

## 4. How skills flow naturally from intent — worked end-to-end flows

These are the canonical chains. You enter at the top; the skill drives the rest and stops at the marked gates.

### Flow A — A design lands in `docs/design/`

```
You: "apply the new design"
        │
   /design-apply ingest      → scans docs/design, writes manifest.json
        │                       (empty/skeleton drop → it stops and says so)
   /design-apply plan         → per surface: fresh-vs-migrate, maps to CATALOG
        │                       components, token-reconciliation table
        │   ▒ GATE: you approve the whole plan once ▒
   /design-apply apply <s>    → for ONE surface:
        ├─ fresh   → /add-pwa-view  (+ /component new for missing primitives)
        ├─ migrate → /component migrate|extract  (semantic-equivalence gate)
        ├─ tokens  → /stitch tokens-sync  (its own diff gate)
        ├─ HARD GATE: scripts/design-conformance.ts must exit 0
        └─ ▒ GATE: human review (Storybook + /review-ui + design-vs-screenshot) ▒
        │
   …repeat apply per surface (never batched)…  →  you commit (worktree + PR)
```
Conductor: `/design-apply`. Canonical DS is **companygraph only**; foreign palettes map onto existing tokens or retune the YAML — never a parallel system. Detail: [`patterns/design-apply.md`](patterns/design-apply.md).

### Flow B — A new multi-phase feature

```
You: "build <feature>"
   /spec new <feature>
        ├─ explores codebase, asks 3-5 scoping questions
        ├─ requirements.md   ▒ GATE Approve/Revise/Reject ▒
        ├─ design.md         ▒ GATE ▒   (skipped for small specs)
        ├─ tasks.md          ▒ GATE ▒
        └─ implementation: each task may call /tdd, /test, /component, /add-*
   /spec status | /spec continue | /spec audit   ← resume / verify drift
```
The orchestrator is **proactive** — after each approved gate it advances itself; you don't re-issue commands. Specs are the durable record of intent under `.claude/specs/`.

For a **whole application** (many features at once), `/spec-app <idea>` sits one level up:

```
You: "plan out this app"
   /spec-app <idea>
        ├─ decompose → .claude/specs/blueprint.md (features, tiers, deps, XD-* decisions)
        │   ▒ GATE: you approve the decomposition (the highest-leverage checkpoint) ▒
        ├─ fan out → .claude/workflows/spec-app.js runs one /spec pipeline PER feature
        │            in parallel — foundation tier first, then the rest in dep-order waves
        │            (each pipeline = the SAME spec-workflow author + spec-review reviewer,
        │             same STATUS.md, same size rules, same 2-pass review cap, same hooks)
        └─ consolidate → cross-spec consistency pass + PROJECT-ROLLUP refresh
            ▒ GATE: you approve the overall plan ▒
```
It **reuses** the single-feature machinery — it does not fork a second spec system. Per-feature review loops run autonomously (the reviewer is always a fresh agent ≠ the author, so "never self-approve" holds); humans gate only the decomposition and the final plan. Ported from `docorg`, rewired to companygraph's spec conventions.

### Flow C — Ship a change

```
work done (ideally in a git worktree on a branch)
   /commit-sequence            → logical-group conventional commits
   git push origin main        → triggers CI/CD pipeline
        Build → DeployStaging → SmokeTest
        ▒ GATE: ApproveProd — manual approval via Telegram ▒
        PromoteProd → production-confirmed notification
   /deploy                     → the skill that walks you through the above
```
**Never run deploy scripts directly** — they're guarded. Push-to-`main` is the deploy trigger.

### Flow D — Something is wrong in production

```
You: "the bot/calendar/PWA is broken"
   /status         → fast local snapshot
   /debug-cloud    → EC2 logs, health endpoints, DB inspection via SSM
        │            (recovery decision tree lives in CLAUDE.md "Reliability")
   fix → Flow C (ship), or escalate to /spec if it's a structural defect
```

### Flow E — Broad investigation or N independent jobs

```
"where is X handled across the codebase?"   → Explore agent (read-only fan-out)
"plan the implementation of Y"              → Plan agent (returns a strategy)
"do these 5 unrelated cleanups"             → /parallel-agents (N agents, disjoint)
"is this an Anthropic-SDK question?"        → claude-code-guide agent
```
You ask the question; Claude spawns the agent and returns only the conclusion (not the file dumps). See §5.

---

## 5. Agents — who they are and when they appear

"Agent" means two different things here. Knowing which keeps flows legible.

### 5a. Claude Code subagents (this coding session)

Spawned by Claude (or by a skill) to parallelize or scope work. **You don't usually invoke these directly** — you state intent and they're chosen.

| Agent | Use it for | You'd notice it when… |
|---|---|---|
| **Explore** | read-only fan-out search across many files | "find everywhere we do X" — returns the conclusion, not dumps |
| **Plan** | designing an implementation strategy | "how should I structure Y?" |
| **general-purpose** | multi-step research / uncertain searches | a task needs several tool rounds |
| **claude-code-guide** | questions about Claude Code / Agent SDK / Anthropic API | "does Claude Code support …?" |
| `/parallel-agents` | **you** explicitly fan out N disjoint jobs | you have 5 unrelated tasks |
| **spec-author** (`.claude/agents/`) | authoring/revising one spec artifact per house format | `/spec-app` fan-outs author requirements/design/tasks |
| **spec-reviewer** (`.claude/agents/`) | adversarial cold review of one spec artifact — **has no Edit tool**, so it can never modify what it judges | every fan-out review gate; verdict approve/revise/reject |
| **spec-architect** (`.claude/agents/`) | decomposing a whole app into a blueprint + feature list (XD-*, View Tree, UX-*, sizes) | `/spec-app` Phase A delegates heavy research |

These are ephemeral, scoped, and report back a result. They keep the main session's context clean. The three `spec-*` agents live in `.claude/agents/` (a pattern adopted from `docorg`) and are thin role wrappers around the `spec-workflow` / `spec-review` / `spec-app` skills — role separation with tool restrictions, not a parallel spec system.

### 5b. Product runtime subagents (the deployed assistant)

Scoped Claude CLI specialists baked into the running product (`telegram/src/subagents/`): **email · calendar · task · research · finance**. Invoked by:
- `/delegate <agent> <task>` (Telegram/REST), or
- automatically inside pipelines (e.g. email triage delegates to the email specialist; `/research` uses the research analyst).

You interact with these through the *product*, not the codebase. Pattern: [`patterns/subagent.md`](patterns/subagent.md).

> **Don't conflate them.** §5a agents help *build* the system; §5b agents are *features of* the system. `/spec-review` is a §5a-style review subagent for spec docs; the finance analyst is a §5b runtime worker.

---

## 6. The cross-cutting discipline that makes flows safe

Every product-mutating skill shares one rule, and it is **not optional**:

### Never self-approve at a review gate
`/component`, `/design-apply`, `/stitch`, `/spec-workflow` each stop at a human gate showing a concrete artifact (a Storybook story, a plan, an assembled prompt, a spec doc). At that gate:

- Claude **stops and waits** for your explicit response. Silence ≠ approval. A "go" earlier in the session ≠ approval of *this* gate.
- "Dogfooding" / autonomous mode does **not** waive the gate — if you're unreachable, the flow surfaces that and halts.
- Overriding requires you to type the override phrase in plain text (e.g. "override review gate"). It is never inferred.

### Other invariants
- **Conformance before review.** `/design-apply` won't show you a surface for review until `scripts/design-conformance.ts` exits 0 for it. Green conformance is *necessary, not sufficient* — a human still reviews.
- **Show before mutating shared state.** Token/design-system changes preview a diff and stop (`/stitch tokens-sync`).
- **One unit at a time.** `/design-apply` applies one surface per `apply`; `/spec` advances one phase per gate. No batching past a gate.
- **No commit/push/deploy inside a build skill.** Skills stop after local writes. Shipping is a separate, explicit step (Flow C).
- **Worktree for non-trivial work.** Two sessions in one checkout cross-contaminate staged files. See CLAUDE.md "Parallel sessions".
- **Run-logs are mandatory, even on failure.** `/stitch`, `/design-apply` write a log every invocation — a "this failed" log beats a missing one.
- **Review cycles are capped** (~3 rounds). Diminishing returns past that; nits are silently patched.

If a skill ever *doesn't* stop where this section says it should, that's a bug in the flow — call it out.

---

## 7. Anti-patterns (how flows go wrong)

| Anti-pattern | Do instead |
|---|---|
| Hand-rolling UI that duplicates a CATALOG row "because it's faster" | `/component migrate` — the conformance gate will reject the duplicate anyway |
| Running a deploy script directly | push to `main`; let CI/CD + the prod gate run (Flow C) |
| Treating green conformance / "looks fine in Storybook" as approval | a human reviews every surface — §6 |
| Building a 10-file feature ad hoc | `/spec new` — so intent is recorded and gated |
| Editing `pwa/src/styles/companygraph/tokens.css` by hand | edit `design-system.yaml`, run `/stitch tokens-sync` |
| A second parallel session in the main checkout | start a worktree (CLAUDE.md) |
| Inventing surfaces from an empty `docs/design/` drop | `/design-apply ingest` stops and says "no design content" — trust it |
| Asking "is the plan ok?" then proceeding without the gate | the gate *is* the approval; wait for it |
| Re-deriving conventions from scratch mid-task | the matching `patterns/*.md` already encodes them |

---

## 8. Quick reference

- **Don't know the command?** Describe the outcome. Claude routes via §3.
- **Full skill list with one-liners:** `/help`, or skim the §3 tables.
- **Architecture (how it runs):** [`.claude/CLAUDE.md`](CLAUDE.md).
- **Code conventions (how skills must write code):** [`.claude/patterns/README.md`](patterns/README.md).
- **Durable feature plans & their status:** `.claude/specs/` (`/spec status`).
- **Design pipeline specifics:** [`patterns/design-apply.md`](patterns/design-apply.md), [`patterns/stitch-when-to-use.md`](patterns/stitch-when-to-use.md), [`design-system.manifest.yaml`](../design-system.manifest.yaml).
- **Reliability / incident decision tree:** CLAUDE.md "Reliability" + `docs/CRITICAL-PATH-RELIABILITY-MATRIX.md`.

**The one sentence:** *say what you want — the skill that owns that intent will pick itself up, do the work to the codebase's standards, and stop at the human gates that keep it safe.*
