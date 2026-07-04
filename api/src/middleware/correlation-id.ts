// Middleware to add correlation ID to requests for distributed tracing

import { generateCorrelationId } from "../logging";

export function withCorrelationId(req: any): any {
  const correlationId = req.headers?.get?.("x-correlation-id") || generateCorrelationId();
  return Object.assign(req, { correlationId });
}
