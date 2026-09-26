# World ID for Agents: a real denied approval

The success path (approve → pay) already has a real Sepolia transaction
([`0xf15571d7…0c48`](https://sepolia.etherscan.io/tx/0xf15571d7c0adcab8e7ac845379c87c466f85c1c98a90ba41e1987a23dba10c48)).
This is the alternative path: a real run against the same sandbox IdP (`sandbox.auth.world.org`), denied, with
nothing paid. Run live on 2026-09-26 against the running agent on `:8788` (chain 11155111 / Sepolia), no phone
needed — the sandbox's fake identities work in a browser.

## The invoice

A fresh urgent invoice (`MS-2026-0926-DENYTEST01`, a synthetic invoice number so it wouldn't collide with
today's other rehearsals of the same fixture), otherwise identical to the real "urgent 至急" demo document:
株式会社メイギ商事, T2011001234567, ¥55,000 to its correctly registered payout.

`POST /invoices/analyze` held it on triage alone, both overridable by a verified human:
```
"verdict":{"decision":"hold","reasons":[
  {"code":"triage_hold","message":"System-1 triage (kev-latest) holds it: p_safe 0.65 is below 0.9; asks to pay a new account or wallet (15%); suspicion 0.67 of 3."},
  {"code":"pressure_hold","message":"This request pushes for a fast payment (System-1 pressure 100%)."}
]}
"approval":{"enabled":true,"approvable":true}
```

## Starting the approval (device authorization grant)

`POST /invoices/842b5f6b-54b8-4367-ae1a-8a2eba091f50/approval`:
```json
{
  "attemptId": "4386c6fd-892b-4ad1-821c-8e52d71f4b99",
  "userCode": "3YKMX-EMG8M",
  "verificationUriComplete": "https://sandbox.auth.world.org/authorize?transaction_id=01a0dc51-5219-7ad6-8015-1f619b52342a",
  "expiresAt": 1790403911,
  "interval": 5
}
```

## Denying it, in the browser

Opened `verificationUriComplete` in a fresh tab (own tab only; the sandbox's "Uses fake identities" banner
confirmed the environment). The page showed the matching user code (`3YKMX-EMG8M`), the requester ("Meigi AP
agent"), and a **"Deny sign-in"** button right alongside the approve flow — clicked deny rather than letting it
expire, since a deliberate decline is cleaner evidence than a 5-minute wait for the same outcome. The page
confirmed: **"Verification was not approved. No information was shared."**

## What the agent recorded

*(The `reason` string below quotes exactly what the backend returned during this run. Its wording — "World App"
— has since been corrected in `services/agent/src/approval/device.ts` to "the World ID app," now that we've
confirmed World split verification into its own app. Quoted here unedited as a record of what actually
happened; a fresh run today would show the corrected string.)*

`GET /invoices/842b5f6b-54b8-4367-ae1a-8a2eba091f50/approval`:
```json
{
  "attemptId": "4386c6fd-892b-4ad1-821c-8e52d71f4b99",
  "status": "denied",
  "expiresAt": 1790403911,
  "used": false,
  "reason": "the person declined in World App"
}
```

## Vault state: nothing paid

`POST /invoices/842b5f6b-54b8-4367-ae1a-8a2eba091f50/pay` (no force, the normal path) still refuses, with the
**same** holds as before the approval attempt — the denial didn't change anything, and no transaction was ever
submitted to the vault or the chain:
```json
{
  "status": "held",
  "reasons": [
    {"code": "triage_hold", "message": "System-1 triage (kev-latest) holds it: p_safe 0.67 is below 0.9; ..."},
    {"code": "pressure_hold", "message": "This request pushes for a fast payment (System-1 pressure 100%)."}
  ]
}
```

No approval id exists to pay with (`used: false`, `status: "denied"`), so there is nothing a subsequent call
could even present as authorization. This is the same server-side validation as the approve path, just refusing
instead of accepting: the agent's own state is the source of truth, not a claim the client could make up.
