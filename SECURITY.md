# Security

What protects the Ananth Residency ordering app, how it is tested, and the settings only the account owners can switch on. No system is unbreakable; this closes the common ways in (the OWASP Top 10) and proves each with an automated attack test.

## What is in place

| Area | Protection | Where |
|---|---|---|
| Customer sign-in | Firebase phone OTP; the ID token's signature, issuer, audience, Indian number and freshness (under 10 minutes) are checked on the server | `server/auth/firebase.ts` |
| Development sign-in | The fixed code `123456` is refused on every Vercel deployment (production and preview) and under `NODE_ENV=production` | `server/env.ts` |
| Staff sign-in | bcrypt (cost 12), same answer and timing for unknown accounts, lockout after 5 wrong passwords per account and 20 per network in 15 minutes, stored in the database so it holds across servers | `server/routes/staff.ts`, `server/security.ts` |
| Staff passwords | 8+ characters, common passwords refused, no phone number or name inside | `shared/password.ts` |
| Sessions | Signed (HS256) httpOnly cookies, `__Host-` prefixed and Secure when deployed, SameSite (Strict for staff), issuer and audience checked; signing out ends a customer's sessions on every device; staff sessions end on password change, deactivation or role change | `server/auth/session.ts`, `server/auth/middleware.ts` |
| Secrets | `SESSION_SECRET` must be 32+ random characters on a deployment; placeholders are refused at start | `server/env.ts` |
| Access control | Customers only ever see their own orders and addresses (404 otherwise); staff routes need a staff session; settings and the team need the owner | routes |
| Cross-site requests (CSRF) | Writes refused when `Sec-Fetch-Site` is cross-site, when `Origin` isn't this site (or not in `APP_ORIGINS`), or when the body isn't JSON | `server/app.ts`, `server/http.ts` |
| Input | Every body validated with zod (types, lengths, ranges, ids inside Postgres range); 32 KB body limit; prices always taken from the database; online orders capped at ₹25,000 | `shared/schemas.ts`, `server/services.ts` |
| SQL injection | All queries parameterised through Drizzle; no string-built SQL | `server/` |
| Cross-site scripting | React escapes all text; the Content Security Policy blocks inline and foreign scripts even if markup got in | `vercel.json` |
| Abuse and flooding | Limits on sign-ins per network, orders per customer (6/hour, 20/day) and per network, payment attempts and account changes | `server/security.ts` |
| Payments | Razorpay order amounts set by the server; checkout and webhook signatures verified with constant-time comparison; malformed or forged webhooks refused; payment marking is idempotent | `server/razorpay.ts`, `server/app.ts` |
| Browser headers | CSP (`default-src 'self'`, no `unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`), HSTS with preload, `X-Frame-Options: DENY`, `nosniff`, strict referrer, Permissions-Policy (camera and microphone off, location for this site only), COOP | `vercel.json` (the preview server sends the same) |
| API responses | `default-src 'none'` CSP, `Cache-Control: no-store`, no CORS headers, errors without internals | `server/app.ts` |
| Redirects | `?next=` after sign-in only accepts a path on this site | `shared/safe-path.ts` |
| Dependencies | `bun audit` clean (patched gRPC and esbuild pinned via `overrides`); Vercel installs with `--frozen-lockfile` | `package.json`, `vercel.json` |
| Privacy | Customer location is saved only with an address the customer chose to pin, and shown only to staff; `/staff` and `/api` are excluded from search engines | `public/robots.txt` |

## Tests

```bash
bun run test                 # API tests: 23 functional + 36 attack tests (server/security.test.ts)
bun run test:devices         # 11 devices in Chromium, Firefox, WebKit
E2E_BASE_URL=http://localhost:4173 bun run test:devices   # same, against the production build with the CSP
bun audit                    # known vulnerabilities in dependencies
```

The attack tests cover forged, tampered, cross-audience and signed-out sessions; `alg: none` tokens; Firebase tokens from other projects, other signers, old sign-ins and foreign numbers; one customer reaching another's orders and addresses; customers and plain staff calling owner endpoints; cross-site and non-JSON writes; oversized and malformed bodies; password and sign-in brute force; order flooding; SQL injection; stored script payloads; impossible quantities and browser-sent prices; prototype pollution; out-of-range ids; open redirects; weak passwords; forged and malformed payment webhooks and fake payment confirmations; and the security headers.

In the browser, with the production headers, an injected inline script, a foreign script, an `onerror` handler and a request to a foreign server were all blocked by the Content Security Policy.

## Switch these on before launch (account owners)

- **Vercel:** set `SESSION_SECRET` (32+ random characters) and `APP_ORIGINS=https://<your domain>`. Never set `DEV_OTP`. Turn on Deployment Protection for preview deployments, and two-factor sign-in for the account.
- **Firebase:** in *Authentication → Settings*, set the SMS region policy to allow India only (stops SMS fraud) and keep only your domain under Authorised domains. Consider App Check with reCAPTCHA Enterprise. Two-factor sign-in for the Google account.
- **Neon:** use the pooled connection string with `sslmode=require`; keep point-in-time restore on.
- **Razorpay:** set the webhook secret, use live keys only in Vercel's encrypted environment variables, two-factor sign-in.
- **GitHub:** keep the repository private, turn on two-factor sign-in and Dependabot alerts.
- **The restaurant:** change the owner password after the first sign-in, give every staff member their own login, and switch off people who leave.

## Known limits

- Pay-on-delivery orders can be fake; the call-to-confirm step and the order limits contain this.
- Phone sign-in is only as safe as the customer's SIM (SIM-swap fraud is outside the app).
- Map tiles come from OpenStreetMap, so its servers see which map area a viewer looks at.
- `style-src 'unsafe-inline'` is allowed because React style attributes and the map need it. Scripts stay strict.
- The Firebase and Razorpay addresses in the CSP follow their documentation. Check sign-in and payment once on the first deployment; a blocked one shows as a "Refused to …" message in the browser console.
- A temporary Cloudflare link to a development server runs with the development sign-in code. Close it after testing.
