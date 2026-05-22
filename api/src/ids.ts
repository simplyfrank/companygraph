import { v7 as uuidV7 } from "uuid";

// UUIDv7 — sortable, monotonic, server-generated per NFR-07.
export function generateId(): string {
  return uuidV7();
}

export const UUIDV7_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isUuidV7(s: unknown): s is string {
  return typeof s === "string" && UUIDV7_REGEX.test(s);
}
