#!/usr/bin/env bash
#
# ux-conformance-sweep.sh — CI gate for the pwa-ux-conformance spec (T-05, FR-07/DD-07).
#
# Recursively enumerates the in-scope PWA surface and runs the authoritative
# design-conformance.ts checker (--view) on every file. Exits non-zero if ANY
# file FAILs, so it can gate merge in CI.
#
# Written as a single find | grep | xargs pipeline so it runs identically under
# `bash scripts/ux-conformance-sweep.sh` and `bun run scripts/ux-conformance-sweep.sh`
# (Bun's built-in shell lacks for-loops/if-exit; the pipeline's final xargs exit
# code — 1 if any per-file check failed, 0 if all clean — is propagated verbatim).
#
# In-scope set (design §5/§5b, B-01): recursive over
#   - pwa/src/views/**       *.tsx + *.module.css  (incl. _shared.*)
#   - pwa/src/components/**   *.tsx + *.module.css  (incl. charts/ — recursion proof, C-03)
#   - pwa/src/styles/**       *.css
# Waived / excluded:
#   - pwa/src/styles/companygraph/tokens.css — auto-generated (checked by stitch --check)
#   - pwa/src/views/model/**                 — studio feature spec (not owned here)
#   - pwa/src/views/exec/Performance*        — studio feature spec (not owned here)
# Only *.tsx and *.css match; bare *.ts palette/util files (e.g. charts/chartColors.ts)
# are outside the remediation set.
#
# Run from the repo root.

echo "ux-conformance-sweep: scanning in-scope PWA surface (views + components + styles)..."
find pwa/src/views pwa/src/components pwa/src/styles -type f | grep -E '\.(tsx|css)$' | grep -v '/model/' | grep -v 'exec/Performance' | grep -v 'styles/companygraph/tokens.css' | sort | xargs -I{} bun run scripts/design-conformance.ts --view {}
