// auth-hardening T-10 (FR-14 / DEC-06) — bun test PRELOAD.
//
// The hardened default (auth-hardening FR-09) is "issuer unset + opt-in
// absent → 401". The repo's existing router-importing unit/integration tests
// ride the DEV-ONLY fallback (they run with ONELOGIN_ISSUER unset). Without
// an opt-in they would all go red. This preload sets AUTH_DEV_FALLBACK=1
// BEFORE any test module loads, so those legacy tests keep passing under the
// loopback dev escape hatch (HOST defaults to loopback 127.0.0.1).
//
// This spec's OWN fail-closed tests do NOT rely on this preload — they set
// AUTH_DEV_FALLBACK / ONELOGIN_ISSUER / HOST explicitly per case (and clear
// them), so they observe the true hardened default regardless of this value.
//
// SECURITY NOTE: this file only affects the `bun test` process. It never
// ships to a deployed instance (production posture is set by env, not by test
// preloads). The committed .env template leaves AUTH_DEV_FALLBACK unset.

process.env.AUTH_DEV_FALLBACK = "1";
