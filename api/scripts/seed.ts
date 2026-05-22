import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "../src/env";

async function main(): Promise<void> {
  const env = loadEnv();
  const seedPath = process.argv[2];
  if (!seedPath) {
    console.error("usage: bun run scripts/seed.ts <seed.json>");
    process.exit(2);
  }
  const absPath = resolve(process.cwd(), seedPath);
  const body = readFileSync(absPath, "utf8");
  const url = `http://${env.host}:${env.apiPort}/api/v1/import`;

  console.log(`[seed] POST ${url} (payload from ${absPath})`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  const out = await res.json();
  console.log(JSON.stringify(out, null, 2));
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
