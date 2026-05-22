# design-apply run-logs

One file per `/design-apply apply` invocation: `<ISO-timestamp>-<surface>.md`.
Mirrors the `.claude/stitch/runs/` convention. **Always written, even on
failure** (SKILL.md Global rule 4) — a missing log is worse than a
"this failed" log.

## Entry format

```markdown
# <surface-id> — <fresh|migrate>

- **Timestamp:** <ISO-8601>
- **Source artifact:** docs/design/<path>
- **Target:** #/<route> · pwa/views/<x>.js
- **Decision:** fresh | migrate (why)
- **Delegated:** /component migrate <…>, /add-pwa-view, /stitch …  (+ outcomes)
- **Conformance:** PASS | FAIL(<rule>) | WAIVED(<rule> — user override quoted verbatim)
- **Review:** approved | revised (round n) | rejected
- **Touched files:** [...]
```

No git operations are logged here — commits/pushes are a separate user
step outside this skill (SKILL.md Global rule 6).
