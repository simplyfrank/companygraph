#!/usr/bin/env bun
/**
 * Deterministic companygraph design-system conformance checker.
 *
 * Used by the /design-apply skill as a HARD gate before a surface
 * reaches the human review gate. Also surfaced by the PreToolUse hook
 * (.claude/hooks/design-guard.sh) for fast edit-time feedback, though
 * THIS script is the authoritative gate (manifest-driven, supports
 * waivers).
 *
 * Usage:
 *   bun run scripts/design-conformance.ts --surface explorer
 *   bun run scripts/design-conformance.ts --view pwa/src/views/explorer.tsx
 *   bun run scripts/design-conformance.ts                 # manifest-driven, all non-pending
 *
 * INERT BY DEFAULT: with no manifest and no --view/--surface, it exits
 * 0 and prints "no targets". This is deliberate so it can be wired into
 * CI without affecting any deploy until /design-apply actually writes a
 * manifest.
 *
 * Canonical decision: companygraph uses OKLCH custom-property tokens
 * declared in pwa/src/styles/companygraph/tokens.css, generated from
 * .claude/stitch/design-system.yaml. Hardcoded colour/size literals in
 * pwa/src/** are a FAILURE unless explicitly waived in the manifest.
 *
 * Checks (FAIL = non-zero exit):
 *   1. tokens-only      — zero `#xxxxxx`, `rgba(<digit>`, `oklch(<digit>` literals
 *   2. no-foreign-ds    — zero `.m-` Maison classes / `Cormorant` refs (inherited
 *                          PA fragments don't belong in companygraph)
 *   3. token-resolvable — every `var(--name)` resolves to a name declared in tokens.css
 * Informational (never fails the build):
 *   4. catalog-drift    — component-ish class names worth a manifest check
 */

import { readFileSync, existsSync } from "fs";
import { join, resolve, basename } from "path";

const ROOT = resolve(import.meta.dir, "..");
const MANIFEST = join(ROOT, ".claude/design-apply/manifest.json");
const TOKENS_CSS = join(ROOT, "pwa/src/styles/companygraph/tokens.css");

const HEX_LITERAL = /#[0-9a-fA-F]{6}\b/g;
const RGBA_LITERAL = /rgba?\(\s*\d/g;
const OKLCH_LITERAL = /oklch\(\s*\d/g;            // raw oklch() outside tokens.css
const MAISON_CLASS = /\bm-[a-z][a-z0-9-]*/g;       // .m-shell, m-tile, …
const CORMORANT = /Cormorant/g;
const VAR_USE = /var\(\s*--([a-z0-9-]+)/g;
const CSS_DECL = /^\s*--([a-z0-9-]+)\s*:/gm;
const COMPONENTISH = /\b(cg|ex|on|ct|an|sm|api|exec)-[a-z][a-z0-9-]*/g;

type Finding = { file: string; rule: string; detail: string; sev: "FAIL" | "INFO" };

function declaredTokens(): Set<string> {
  const set = new Set<string>();
  if (!existsSync(TOKENS_CSS)) return set;
  const src = readFileSync(TOKENS_CSS, "utf8");
  let m: RegExpExecArray | null;
  const re = new RegExp(CSS_DECL.source, "gm");
  while ((m = re.exec(src))) set.add(m[1]!);
  return set;
}

function checkFile(relPath: string, tokens: Set<string>, waivers: string[]): Finding[] {
  const abs = join(ROOT, relPath);
  if (!existsSync(abs)) return [];
  const src = readFileSync(abs, "utf8");
  const out: Finding[] = [];
  const waived = (rule: string) => waivers.includes(rule) || waivers.includes(`${relPath}:${rule}`);

  if (!waived("tokens-only")) {
    const hex = src.match(HEX_LITERAL) || [];
    const rgba = src.match(RGBA_LITERAL) || [];
    const oklch = src.match(OKLCH_LITERAL) || [];
    if (hex.length)
      out.push({ file: relPath, rule: "tokens-only", sev: "FAIL", detail: `${hex.length} hex literal(s): ${[...new Set(hex)].slice(0, 6).join(", ")}` });
    if (rgba.length)
      out.push({ file: relPath, rule: "tokens-only", sev: "FAIL", detail: `${rgba.length} rgba()/rgb() literal(s)` });
    if (oklch.length)
      out.push({ file: relPath, rule: "tokens-only", sev: "FAIL", detail: `${oklch.length} inline oklch() literal(s) — declare in tokens.css and use var(--…)` });
  }

  if (!waived("no-foreign-ds")) {
    const m = src.match(MAISON_CLASS) || [];
    const c = src.match(CORMORANT) || [];
    if (m.length)
      out.push({ file: relPath, rule: "no-foreign-ds", sev: "FAIL", detail: `${m.length} legacy .m-* class ref(s): ${[...new Set(m)].slice(0, 6).join(", ")}` });
    if (c.length)
      out.push({ file: relPath, rule: "no-foreign-ds", sev: "FAIL", detail: `Cormorant serif referenced (non-canonical font in companygraph)` });
  }

  if (!waived("token-resolvable")) {
    let m: RegExpExecArray | null;
    const re = new RegExp(VAR_USE.source, "g");
    const bad = new Set<string>();
    while ((m = re.exec(src))) {
      const name = m[1]!;
      if (!tokens.has(name)) bad.add(name);
    }
    if (bad.size)
      out.push({ file: relPath, rule: "token-resolvable", sev: "FAIL", detail: `unknown token(s): ${[...bad].slice(0, 8).map((n) => `--${n}`).join(", ")}` });
  }

  const comp = [...new Set(src.match(COMPONENTISH) || [])];
  if (comp.length)
    out.push({ file: relPath, rule: "catalog-drift", sev: "INFO", detail: `${comp.length} component-ish class prefix(es) — verify each maps to a manifest row` });

  return out;
}

function loadManifestSurfaces(): Array<{ id: string; touched_files: string[]; waivers?: string[]; status?: string }> {
  if (!existsSync(MANIFEST)) return [];
  try {
    const j = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const arr = Array.isArray(j) ? j : j.surfaces || [];
    return arr;
  } catch (e) {
    console.error(`design-conformance: manifest exists but failed to parse: ${(e as Error).message}`);
    process.exit(2);
  }
}

function main() {
  const args = process.argv.slice(2);
  const surfaceArg = args[args.indexOf("--surface") + 1];
  const viewArg = args[args.indexOf("--view") + 1];
  const wantSurface = args.includes("--surface") ? surfaceArg : null;
  const wantView = args.includes("--view") ? viewArg : null;

  const tokens = declaredTokens();
  let targets: Array<{ id: string; files: string[]; waivers: string[] }> = [];

  if (wantView) {
    targets = [{ id: basename(wantView), files: [wantView], waivers: [] }];
  } else {
    const surfaces = loadManifestSurfaces();
    for (const s of surfaces) {
      if (wantSurface && s.id !== wantSurface) continue;
      if (!wantSurface && (s.status === "pending" || s.status === "reverted")) continue;
      targets.push({ id: s.id, files: s.touched_files || [], waivers: s.waivers || [] });
    }
  }

  if (!targets.length || targets.every((t) => !t.files.length)) {
    console.log("design-conformance: no targets (inert) — exit 0");
    process.exit(0);
  }

  let failed = false;
  for (const t of targets) {
    const findings: Finding[] = [];
    for (const f of t.files) findings.push(...checkFile(f, tokens, t.waivers));
    const fails = findings.filter((x) => x.sev === "FAIL");
    const infos = findings.filter((x) => x.sev === "INFO");
    console.log(`\n── surface: ${t.id} (${t.files.length} file(s)) ──`);
    if (!findings.length) {
      console.log("  ✅ clean");
      continue;
    }
    for (const x of fails) console.log(`  ❌ [${x.rule}] ${x.file} — ${x.detail}`);
    for (const x of infos) console.log(`  ℹ️  [${x.rule}] ${x.file} — ${x.detail}`);
    if (fails.length) failed = true;
  }

  console.log(`\ndesign-conformance: ${failed ? "FAIL" : "PASS"}`);
  process.exit(failed ? 1 : 0);
}

main();
