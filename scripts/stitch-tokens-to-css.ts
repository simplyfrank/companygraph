#!/usr/bin/env -S bun run
/**
 * Convert .claude/stitch/design-system.yaml → pwa/src/styles/companygraph/tokens.css.
 *
 * design-system.yaml is the source of truth for design tokens. This script
 * reads it, validates the shape, and emits a CSS custom-properties file
 * consumed by the PWA. The Stitch side of the sync (push to platform via
 * mcp__stitch__update_design_system) is driven by Claude in the /stitch
 * skill — this script handles only the local CSS emit.
 *
 * Companygraph layout note: tokens land under pwa/src/styles/companygraph/
 * (not pwa/styles/ as in personalassistant) because companygraph uses a
 * Vite + React layout with src/styles/ as the convention.
 *
 * Usage:
 *   bun run scripts/stitch-tokens-to-css.ts             # write pwa/src/styles/companygraph/tokens.css
 *   bun run scripts/stitch-tokens-to-css.ts --dry-run   # print to stdout
 *   bun run scripts/stitch-tokens-to-css.ts --check     # exit non-zero if file would change
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const REPO_ROOT = join(import.meta.dir, "..");
const YAML_PATH = join(REPO_ROOT, ".claude/stitch/design-system.yaml");
const CSS_PATH = join(REPO_ROOT, "pwa/src/styles/companygraph/tokens.css");

type YamlValue = string | number | boolean | null | YamlValue[] | { [k: string]: YamlValue };

interface DesignSystem {
  name: string;
  description?: string;
  mode: string;
  fonts: {
    headline: string;
    body: string;
    label: string;
    icon: string;
    google_fonts_url: string;
  };
  colors: { [name: string]: string };
  typography: {
    [name: string]: {
      font_family: string;
      size_px: number;
      weight: number | string;
      line_height: number | string;
      letter_spacing: string | number;
      transform?: string;
    };
  };
  spacing: { [name: string]: string };
  roundness: { [name: string]: string };
  layout?: { [name: string]: string };          // companygraph addition — rail_width, topbar_h, etc.
  legacy_aliases?: { [legacyName: string]: string };
}

// ---------------------------------------------------------------------------
// Minimal YAML parser — covers the subset used by design-system.yaml.
// Supports: indent-based nesting, key: value pairs, quoted/unquoted scalars,
// numbers, booleans, null, arrays of scalars (- value), folded block scalars (>),
// and # line comments (when not inside double quotes — important for hex strings
// like "#12131c").
// ---------------------------------------------------------------------------
function parseYaml(text: string): YamlValue {
  // Strip comments — careful around "#..." hex literals inside double quotes.
  const cleanLines = text.split("\n").map((line) => {
    let out = "";
    let inDQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i - 1] !== "\\") inDQ = !inDQ;
      if (ch === "#" && !inDQ) break;
      out += ch;
    }
    return out.trimEnd();
  });

  const lines = cleanLines
    .map((l, i) => ({ raw: l, lineNo: i + 1 }))
    .filter((l) => l.raw.trim().length > 0)
    .map(({ raw, lineNo }) => ({
      indent: raw.length - raw.trimStart().length,
      content: raw.trim(),
      lineNo,
    }));

  let pos = 0;

  function parseScalar(s: string): YamlValue {
    if (s === "" || s === "~" || s === "null") return null;
    if (s === "true") return true;
    if (s === "false") return false;
    if (s.startsWith('"') && s.endsWith('"')) {
      return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    if (s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
    if (/^-?\d+$/.test(s)) return parseInt(s, 10);
    if (/^-?\d+\.\d+$/.test(s)) return parseFloat(s);
    return s;
  }

  function parseBlock(blockIndent: number): YamlValue {
    if (pos >= lines.length || lines[pos].indent < blockIndent) return {};

    const first = lines[pos];

    // Array block: every line at this indent starts with "- "
    if (first.content.startsWith("- ") || first.content === "-") {
      const arr: YamlValue[] = [];
      while (
        pos < lines.length &&
        lines[pos].indent === first.indent &&
        (lines[pos].content.startsWith("- ") || lines[pos].content === "-")
      ) {
        const item = lines[pos].content.replace(/^-\s*/, "");
        arr.push(parseScalar(item));
        pos++;
      }
      return arr;
    }

    // Object block
    const obj: { [k: string]: YamlValue } = {};
    while (pos < lines.length && lines[pos].indent === first.indent) {
      const cur = lines[pos];
      const colon = cur.content.indexOf(":");
      if (colon < 0) {
        throw new Error(`YAML line ${cur.lineNo}: expected key: value, got "${cur.content}"`);
      }
      const key = cur.content.slice(0, colon).trim();
      const rest = cur.content.slice(colon + 1).trim();
      pos++;

      if (rest === ">" || rest === ">-" || rest === "|" || rest === "|-") {
        // Block scalar — collect more-indented lines and join.
        const folded = rest.startsWith(">");
        const childIndent = pos < lines.length ? lines[pos].indent : -1;
        if (childIndent > cur.indent) {
          const parts: string[] = [];
          while (pos < lines.length && lines[pos].indent >= childIndent) {
            parts.push(lines[pos].content);
            pos++;
          }
          obj[key] = folded ? parts.join(" ") : parts.join("\n");
        } else {
          obj[key] = "";
        }
      } else if (rest === "") {
        if (pos < lines.length && lines[pos].indent > cur.indent) {
          obj[key] = parseBlock(lines[pos].indent);
        } else {
          obj[key] = {};
        }
      } else {
        obj[key] = parseScalar(rest);
      }
    }
    return obj;
  }

  return parseBlock(lines.length > 0 ? lines[0].indent : 0);
}

// ---------------------------------------------------------------------------
// Validate the shape we expect.
// ---------------------------------------------------------------------------
function assertDesignSystem(raw: YamlValue): asserts raw is unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("design-system.yaml must be a mapping at the top level");
  }
  for (const required of ["colors", "typography", "spacing", "roundness", "fonts"]) {
    if (!(required in (raw as Record<string, unknown>))) {
      throw new Error(`design-system.yaml is missing required top-level key: ${required}`);
    }
  }
}

// ---------------------------------------------------------------------------
// CSS emission.
// ---------------------------------------------------------------------------
// companygraph naming convention — variable names match the
// design/companygraph/companygraph-views.html mock's :root verbatim, so
// the existing mocks AND newly-extracted React components share one
// vocabulary. Notably:
//   colors: emit as `--<name>` (no `--color-` prefix)
//   fonts:  emit as `--font-display/--font-body/--font-mono` (map from
//           headline/body/icon — `label` is unused in companygraph)
//   layout: emit as `--<key-with-underscores-as-dashes>`
//
// Typography scales (--type-…), spacing (--space-…), and roundness
// (--radius-…) keep their prefixes — these are net-new names not
// present in the mock, used by extracted components.

function emitCss(ds: DesignSystem): string {
  const out: string[] = [];
  out.push("/*");
  out.push(" * AUTO-GENERATED from .claude/stitch/design-system.yaml.");
  out.push(" * DO NOT EDIT BY HAND. Edit design-system.yaml and run:");
  out.push(" *   bun run scripts/stitch-tokens-to-css.ts");
  out.push(" *");
  out.push(` * Design system: ${ds.name}`);
  out.push(` * Mode: ${ds.mode}`);
  out.push(" */");
  out.push("");
  if (ds.fonts.google_fonts_url) {
    out.push(`@import url("${ds.fonts.google_fonts_url}");`);
    out.push("");
  }
  out.push(":root {");

  out.push("  /* Colours — flat names match the mock's :root */");
  for (const [name, value] of Object.entries(ds.colors)) {
    out.push(`  --${name.replace(/_/g, "-")}: ${value};`);
  }

  out.push("");
  out.push("  /* Fonts — three native stacks (display / body / mono) */");
  out.push(`  --font-display: -apple-system, BlinkMacSystemFont, "${ds.fonts.headline}", system-ui, sans-serif;`);
  out.push(`  --font-body:    -apple-system, BlinkMacSystemFont, "${ds.fonts.body}", system-ui, sans-serif;`);
  out.push(`  --font-mono:    ui-monospace, "${ds.fonts.icon}", Menlo, Consolas, monospace;`);

  if (ds.layout && Object.keys(ds.layout).length > 0) {
    out.push("");
    out.push("  /* Layout dimensions */");
    for (const [name, value] of Object.entries(ds.layout)) {
      // rail_width → rail-w (companygraph mock convention)
      const cssName = name === "rail_width" ? "rail-w"
        : name === "topbar_h" ? "topbar-h"
        : name === "subnav_h" ? "subnav-h"
        : name === "panel_w" ? "panel-w"
        : name.replace(/_/g, "-");
      out.push(`  --${cssName}: ${value};`);
    }
  }

  out.push("");
  out.push("  /* Spacing — 8px rhythm */");
  for (const [name, value] of Object.entries(ds.spacing)) {
    out.push(`  --space-${name}: ${value};`);
  }

  out.push("");
  out.push("  /* Roundness */");
  for (const [name, value] of Object.entries(ds.roundness)) {
    const safeName = name === "default" ? "default" : name;
    out.push(`  --radius-${safeName}: ${value};`);
  }

  out.push("");
  out.push("  /* Typography scales — companygraph addition (h1/h2/h3/body/lede/mono/caption-mono) */");
  for (const [name, scale] of Object.entries(ds.typography)) {
    out.push(`  --type-${name}-family: "${scale.font_family}", system-ui, sans-serif;`);
    out.push(`  --type-${name}-size: ${scale.size_px}px;`);
    out.push(`  --type-${name}-weight: ${scale.weight};`);
    out.push(`  --type-${name}-line-height: ${scale.line_height};`);
    out.push(`  --type-${name}-letter-spacing: ${scale.letter_spacing};`);
    if (scale.transform) {
      out.push(`  --type-${name}-transform: ${scale.transform};`);
    }
  }

  out.push("}");
  out.push("");

  // Legacy aliases — bridge for pre-companygraph components (none today).
  if (ds.legacy_aliases && Object.keys(ds.legacy_aliases).length > 0) {
    out.push("/*");
    out.push(" * Legacy aliases — DEPRECATED. Bridge for pre-companygraph components.");
    out.push(" * Drop a row in design-system.yaml when the last consumer migrates.");
    out.push(" */");
    out.push(":root {");
    for (const [legacyName, canonical] of Object.entries(ds.legacy_aliases)) {
      const cssLegacy = legacyName.replace(/_/g, "-");
      const cssCanonical = canonical.replace(/_/g, "-");
      out.push(`  --${cssLegacy}: var(--${cssCanonical});`);
    }
    out.push("}");
    out.push("");
  }

  // Convenience utility classes for the named type scales.
  out.push("/* Utility classes for the named type scales */");
  for (const [name, scale] of Object.entries(ds.typography)) {
    const transform = scale.transform ? `\n  text-transform: var(--type-${name}-transform);` : "";
    out.push(`.text-${name} {`);
    out.push(`  font-family: var(--type-${name}-family);`);
    out.push(`  font-size: var(--type-${name}-size);`);
    out.push(`  font-weight: var(--type-${name}-weight);`);
    out.push(`  line-height: var(--type-${name}-line-height);`);
    out.push(`  letter-spacing: var(--type-${name}-letter-spacing);${transform}`);
    out.push("}");
  }
  out.push("");

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main(): number {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const check = args.has("--check");

  const yamlText = readFileSync(YAML_PATH, "utf8");
  const parsed = parseYaml(yamlText);
  assertDesignSystem(parsed);
  const ds = parsed as unknown as DesignSystem;

  const css = emitCss(ds);

  if (dryRun) {
    process.stdout.write(css);
    return 0;
  }

  if (check) {
    const existing = existsSync(CSS_PATH) ? readFileSync(CSS_PATH, "utf8") : "";
    if (existing !== css) {
      console.error(`tokens.css is out of date. Run: bun run scripts/stitch-tokens-to-css.ts`);
      return 1;
    }
    console.log("tokens.css up to date.");
    return 0;
  }

  mkdirSync(dirname(CSS_PATH), { recursive: true });
  const existing = existsSync(CSS_PATH) ? readFileSync(CSS_PATH, "utf8") : "";
  if (existing === css) {
    console.log(`tokens.css unchanged (${css.length} bytes).`);
    return 0;
  }
  writeFileSync(CSS_PATH, css);
  console.log(`Wrote ${CSS_PATH} (${css.length} bytes).`);
  if (!existing) {
    console.log("(new file)");
  }
  return 0;
}

process.exit(main());
