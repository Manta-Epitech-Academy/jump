/**
 * Client start-up, run once before any route.
 *
 * Zod compiles a fast path for object schemas with `new Function`, and finds out
 * whether it may by trying it the first time one is parsed. The policy here
 * (`svelte.config.js`) never allows `eval`, so the compiled path can never run
 * in a browser, and the probe is not free: the browser reports the refused call
 * as a `securitypolicyviolation` although Zod swallows the throw. That is a
 * violation on every page that validates a form, which buries the one that
 * would mean a script is genuinely broken. `jitless` skips the probe and
 * changes nothing else, since the interpreted path is the one already taken.
 *
 * Client only: the server sends no policy to itself, and keeps the fast path.
 */
import { z } from 'zod';

z.config({ jitless: true });
