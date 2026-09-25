# Spec: human approval for held agent payments (World ID for Agents)

Target: the World prize track "Best Use of World ID for Agents". The requirement: the official dev env
(`https://sandbox.auth.world.org`), a fresh human verification **at the moment of a meaningful agent action**,
validated in a secure backend, plus a denied / expired / cancelled path where the action does not happen.

## The moment

The AP agent holds a payment when it isn't sure: triage flagged pressure or urgency, or the amount is above
the auto-clear budget. Today the only way past a hold is the demo-only "pay anyway", which exists to show the
chain refusing. This adds the real path: **a verified human approves this one payment, freshly, and only then
does the agent pay.** It is not a login screen; nobody signs in to use the console.

The chain still has the last word. Approval can't make the vault pay anything but the registered payout, and
the vault re-checks vendor, caps and payee.

## Identity provider facts (read 2026-09-26 from the IdP's public guides)

- **Issuer:** `https://sandbox.auth.world.org`. Discovery is at `/.well-known/openid-configuration` and keys at
  `/.well-known/jwks.json`. ID tokens are RS256.
- **Scope:** exactly `openid`. The `sub` is pairwise: the same human always gets the same `sub` within our
  sector.
- **Device grant (RFC 8628)** is supported for confidential clients: `POST /api/v1/device_authorization`, then
  poll `POST /api/v1/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`.
  - The human opens `verification_uri_complete`, checks the requester and user code, proves with World App
    (the World ID Sandbox app in sandbox), and approves or denies.
  - The device grant always requires a fresh proof. It ignores `nonce`, `max_age` and `prompt`, and the ID
    token has no `nonce`.
  - Poll errors: `authorization_pending` (wait), `slow_down` (+5 s to the interval), and `access_denied` /
    `expired_token` / `invalid_grant` (stop). HTTP 503 means unavailable, never approved.
  - The device code expires after 20 minutes and can be redeemed once.
- **ID token claims:** `iss sub aud exp iat jti auth_time acr amr`, with `acr` =
  `https://world.org/oidc/acr/orb-v3` and `amr` = `["pop"]`. Tokens live for 5 minutes. Use `auth_time` for
  freshness, never `iat`.
- **Client registration:** at `/portal`, with Google sign-in (the account must be eligible). The secret is
  shown once. The default auth method is `client_secret_basic`. A redirect URI must be registered even for a
  device-only client, and sandbox requires HTTPS, e.g. `https://meigi-app.karanbishttt.workers.dev/world/callback`.

## Agent service (`services/agent`)

**Config** (all optional; the feature is off without a client):
- `WORLD_AGENTS_ISSUER`, defaulting to `https://sandbox.auth.world.org`.
- `WORLD_AGENTS_CLIENT_ID` and `WORLD_AGENTS_CLIENT_SECRET`, loaded only from the env and never logged.
- `WORLD_AGENTS_APPROVERS`: a comma-separated list of allowed `sub` values. When empty, the first approved
  proof enrolls the approver, stored with the invoice store. Its first use is shown in the console as
  "enrolled".

**Module** `src/approval/`, small files:
- `idp.ts`: discovery (cached) and JWKS via `jose.createRemoteJWKSet`.
- `device.ts`: start and poll, with bounded timeouts and the stop rules above.
- `token.ts`: ID-token validation:
  - exact `iss`, `aud` equal to the client id, RS256, `exp`;
  - `acr` equal to orb-v3;
  - `auth_time` ≥ attempt start − 30 s and not in the future beyond 30 s.
- `approvals.ts`: the state machine.

**Binding.** An approval attempt is bound server-side to the snapshot it was started for:
- invoice id;
- T-number;
- payout address;
- amount;
- invoice reference;
- the hold reasons.

When the analysis changes, the attempt is void. An approval is single-use: it is consumed by exactly one pay
attempt.

**Which holds a human can approve.** The same allow-list as force: triage hold and urgency/pressure. A human
can never approve document-integrity blocks:
- credit note or refund;
- hidden content or markup;
- ambiguous totals;
- missing invoice number or T-number;
- multiple addresses or T-numbers.

**Routes:**
- `POST /invoices/:id/approval` → `202 { attemptId, userCode, verificationUriComplete, expiresAt, interval }`.
  - It returns 409 unless the invoice is held only for approvable reasons.
  - Never return the device code.
- `GET /invoices/:id/approval` → `{ status: "pending" | "approved" | "denied" | "expired" | "unavailable" |
  "wrong_human", approvedAt?, approver?: "enrolled" | "matched" }`.
  - A background poller per attempt respects `interval` / `slow_down` and stops on expiry.
- `POST /invoices/:id/pay { approvalId }` → the existing pay path. The approval stands in for the triage hold;
  the kernel, vault and chain checks all still run.

**Tests** (vitest, with no network):
- A mock IdP: jose generates an RSA key and serves JWKS, and the device and token endpoints are fakes.
- **Happy path:** approved, then paid.
- **Denied** (`access_denied`) and **expired** (`expired_token`): the invoice stays held and nothing reaches
  the payer.
- **Wrong human:** a different `sub` is rejected, and nothing is paid.
- **Invalid tokens:** stale `auth_time`, wrong `aud` and wrong `iss` are each rejected.
- **Non-approvable holds:** 409.
- **Reuse:** a second pay with the same approval is rejected.
- **Changed analysis:** the approval is void.

## Web (`apps/web`, agent console)

When the verdict is "held" and the hold is human-approvable, show a primary button: **"Ask a verified human to
approve"**.
- It shows a QR code of `verificationUriComplete`, the user code, and a countdown.
- It polls the status.
- **Approved:** "Approved by a verified human (World ID, fresh proof at 05:42)", then pays and shows the tx
  link.
- **Denied, expired or wrong human:** a calm red notice: "Not approved: nothing was paid."
- The old "Let the agent pay anyway" button stays, labeled as the attack demo.

## Demo (both paths)

1. Paste a legitimate invoice from 株式会社メイギ商事 that says 至急 (urgent). Triage holds it for pressure.
2. Ask a verified human, then scan with World App. The same `sub` approves, and the agent pays: Sepolia tx.
3. Paste it again as a new invoice number, then Ask → **Deny** in World App: nothing is paid. Or let it expire.

## Debrief notes to collect

- Time to the first approved token.
- Any friction in portal eligibility.
- Whether the World App screen shows our requester name.
- The fact that the device grant can't carry a `nonce` or binding message, so the binding lives server-side.
