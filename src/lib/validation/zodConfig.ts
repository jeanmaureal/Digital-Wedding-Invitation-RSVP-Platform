import { z } from 'zod';

/**
 * Configures Zod v4 in CSP-safe `jitless` mode (`P9-AC07`).
 *
 * Why this is mandatory under strict `script-src 'self'`:
 * By default, Zod v4 runs a one-time `new Function("")` probe (`allowsEval`)
 * when compiling object schemas. Even though Zod catches `EvalError` and falls
 * back to interpreter mode, Chromium still emits a `securitypolicyviolation`
 * event and console error unless `jitless: true` is configured upfront.
 */
let configured = false;

export function ensureCspSafeZodConfig(): void {
  if (configured) {
    return;
  }
  z.config({ jitless: true });
  configured = true;
}

ensureCspSafeZodConfig();
