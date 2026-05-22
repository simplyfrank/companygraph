import type { z } from "zod";
import { ValidationError } from "./errors";

// Runs a zod parse and normalises failures to the project's standard
// error envelope shape (NFR-05). Returns the parsed value on success.
export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
): z.infer<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ValidationError("invalid_payload", {
    fieldErrors: result.error.flatten().fieldErrors,
    formErrors: result.error.flatten().formErrors,
  });
}
