import type { Health, Stats } from "@companygraph/shared/types";

export async function getHealthz(): Promise<Health> {
  const res = await fetch("/api/v1/healthz");
  return res.json() as Promise<Health>;
}

export async function getStats(): Promise<Stats> {
  const res = await fetch("/api/v1/stats");
  return res.json() as Promise<Stats>;
}
