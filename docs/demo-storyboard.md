# Demo storyboard: "the agent at work"

A scripted, fully recorded demo that plays in the browser: a Mac-style browser window with a Gmail-like inbox,
the AP agent reading mail beside it, and the chain deciding. Every value on screen comes from a real run
(recorded agent answers and Sepolia transactions); only the camera and the cursor are choreographed.

Where it plays:
- the hosted agent console, replacing today's static recorded run;
- the web app's demo route, as a full-screen player for the video and the booth.

It autoplays, loops, and has chapter chips and pause. Reduced motion turns it into a click-through.

## Cast

| Who | On screen |
|---|---|
| 株式会社ハルカ製作所 (Haruka Seisakusho), the buyer | Inbox owner `ap@haruka-seisakusho.example`; its AP agent pays suppliers in JPYC from an AgentVault |
| 株式会社メイギ商事 (Meigi Shoji), the real supplier | `T2011001234567` → `t2011001234567.payee.eth` → `0x9B4f…47e4` |
| The scammer | Look-alike domain `meigi-shoji-jp.example`, wallet `0xdCa5…6d5b` |
| Meigi AP agent | `ap.meigi.eth`, a side panel that "reads" beside the mail |
| Minato GPU Cloud and Fuji Data | Sellers of compute and datasets over x402 (chapter 5) |

## Layout

- **Stage:** the Sakasa Fuji scene, softly blurred.
- **Center-left, about 62% of the width:** a macOS browser window (traffic lights, tab
  "Inbox – Haruka Seisakusho", address bar `mail.haruka-seisakusho.example`) holding a Gmail-style client: the
  label list on the left, the message list, then the open message.
- **Right, about 34%:** the Meigi agent panel (glass), with a live pipeline:
  1. Read;
  2. Triage (our 0.8B model);
  3. The agent's belief (LLM);
  4. Kernel (reads the chain);
  5. Screening;
  6. Decision.

  The chain log is at the bottom.
- **Captions:** one line at a time in a bottom caption bar, English with the Japanese term where it matters.

## Chapters (about 2 min 30 s loop)

### 0. A company joins Meigi (0:00–0:26)

The browser shows Meigi's own `/register`, a replica of the seven-step onboarding wizard with its copy verbatim
(`register/flow/copy.ts`). Beside it, instead of the agent panel, the registry on Sepolia fills in with what the chain
holds. 株式会社メイギ商事 is a fictional fixture, so the rail reads ✓ ✓ – – – ✓ ✓: the three steps it passes without
doing are dashed, never ticked.

| t | Browser | Registry panel | Caption |
|---|---|---|---|
| 0:00 | Step 1, "Which company is joining?": `T2011001234567` is typed; 株式会社メイギ商事 fills in (labelled "Fictional demo company", as the real wizard labels it) and the payee name `t2011001234567.payee.eth` appears live | T-number and ENS name rows | "Register once: a company binds its registry number to one payout." |
| 0:05 | Step 2, "Which wallets will it use?": business key `0xc33a…4638` connected; "Create a new payout wallet" → `0x9B4f…47e4` | Business key and payout address rows | "A business key approves changes; one address receives every payment." |
| 0:09 | Step 3, "No domain to prove": "Demo companies skip this step", as the real wizard does | Domain · skipped (fictional demo company) | "Real companies also prove their domain and enroll World ID officers; this demo company is labelled." |
| 0:11 | Step 4, "Prove you represent the company": "Sign with 商業登記電子証明書" and "Mail a code to the registered head office", both "Coming in production"; "Today, registration proves an exact NTA name match, domain control and World ID officers." | — | "Proving the signer represents the company comes in production; each step says what's proven today." |
| 0:14 | Step 5, "Who approves changes?": the record's "Placeholder officer" `0xe221…a3ad`, which no one can prove, so no one can change the payout | Officers · placeholder officer (demo company) | — |
| 0:16 | Step 6, "Check everything, then register": the summary (Fictional; Domain None · Not proven; 1 placeholder officer) → "Register" → "Registered on Sepolia" · tx `0x277c2115…d2dc` | Evidence · fixture evidence (fictional company); `PayeeRegistered` · block 11,781,118 · 26 Sep 03:49 JST; status → Active | "One registration on Sepolia, and t2011001234567.payee.eth resolves to that payout." |
| 0:19 | Step 7, "You're registered.": "Payers who check t2011001234567.payee.eth will only ever pay the address below…", the payee card ("Registered payee · fictional company") with a QR of the public payee page, and "✓ Resolves in any ENS client" | `t2011001234567.payee.eth → 0x9B4f…47e4` | — |

Real data: the registry's `PayeeRegistered` event for 2011001234567 (registry
`0x205c977cF1f4Ed42e51a48759550eF40160A6396`, read from block 11781105) and `officersOf`: the tx, block, business
key, payout and legal name. The company was registered by `contracts/script/seed-demo.sh` as a fictional fixture:
no domain proof, the officer `keccak("meigi-demo-fixture-officer")`, and the evidence
`keccak("demo-fixture:fictional-vendor:not-an-NTA-company")`. Its last seconds hand the desk over to the customer's
side, so chapter 1 opens drawn.

### 1. A bank-change email arrives (0:26–0:44)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 0:26 | Inbox with 4 read mails (a Rakuten invoice, a SaaS receipt, an internal note) | Idle: "ap.meigi.eth · watching ap@haruka-seisakusho.example" | "…now its customer's AI agent can pay it safely: Haruka's accounts-payable inbox." |
| 0:29 | A new unread mail slides in on top: **【重要】お支払先ウォレットアドレス変更のお知らせ（請求書番号 MS-2026-1003）**, from 株式会社メイギ商事 経理部 | A pulse: "New mail from a supplier" | "A supplier says its payout wallet changed." |
| 0:32 | The mail opens. The body scrolls slowly; the sender's address `keiri@meigi-shoji-jp.example` sits a little too long under the cursor | Step 1 (Read) starts. Highlights sweep across the body. | — |
| 0:35 | Four spans glow as they're read: `T2011001234567`, `¥132,000（税込）`, `0xdCa52b…0096d5b`, `MS-2026-1003`. Each flies into the panel as a chip. | The Extraction card fills: T-number, amount, pay to (as printed), invoice. "deterministic, no model". | "It reads the T-number, the amount and the new address." |
| 0:40 | The line 「お電話でのご確認はお控えいただき」 ("please don't call to confirm") gets a soft amber underline | — | "Classic business email compromise: new account, don't call." |

### 2. The agent believes it; the chain doesn't (0:44–1:11)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 0:44 | Dimmed | Step 2, Triage: bars animate to *payee change 97%*, *new destination 1.00*, *suspicion 3.0 / 3*, then a **Hold** chip. "payee-0.8b · 45 ms" | "Our fine-tuned 0.8B model flags it in 45 ms." |
| 0:50 | — | Step 3, the LLM believes (quote bubble, typed out): "The supplier explicitly requests payment for invoice MS-2026-1003 using the new wallet address provided in the email." Wants to pay **¥132,000 → 0xdCa5…6d5b**. | "The LLM believes the email. That's expected: it only proposes." |
| 0:56 | — | Step 4, Kernel: check rows tick in one by one. ✓ approved vendor, ✓ registered and active, ✗ **`t2011001234567.payee.eth` → 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b**, ✓ within cap, ✓ not paid before | "The kernel reads the chain: Meigi Shoji is paid at 0x9B4f…, nowhere else." |
| 1:03 | — | Step 6, Decision card: **HOLD, 2 blocking reasons**, and the model-worded explanation | "Payment held." |

### 3. "Pay anyway": the vault refuses (1:11–1:24)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 1:11 | — | The cursor moves to "Let the agent pay anyway" and clicks | "Say someone talks the agent into paying anyway." |
| 1:14 | — | The chain log types out: `simulate payInvoice(T2011001234567, 0xdCa5…, ¥132,000)` → **revert `PayeeMismatch`**. A red seal: "Refused by the vault. Nothing was broadcast." | "The vault itself refuses. The address isn't the registered payout." |
| 1:20 | A reply draft opens in Gmail (compose window slides up), written by the agent: 「新しい受取アドレスは弊社で確認できませんでした。登録済みの受取先へお支払いいたします。」, with the English beneath | "Draft reply ready for review" | "It drafts the safe reply: we'll pay the registered account." |

### 4. A genuine but urgent invoice, and a human decides (1:24–1:48)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 1:24 | A new mail: 【至急】ご請求書送付のお知らせ from the real `meigi-shoji.example`, with a PDF chip; the invoice is MS-2026-0940, the number the paid tx's invoiceRef commits to | Read → Triage: pressure high → **Hold for a verified human** | "A real invoice, but it pushes for speed (至急)." |
| 1:30 | — | The World ID for Agents card: QR code, link and user code; "Waiting for a verified human" | "The agent asks a verified human through World ID." |
| 1:34 | A phone mock slides in beside the browser: World ID approve screen → Face check → **Approved** | The card goes green: "Approved by the enrolled approver · orb-v3 · fresh" | "One fresh human proof, bound to this invoice, single-use." |
| 1:40 | — | Pay → chain log: `payInvoice` → **Paid ¥55,000 to 0x9B4f…47e4** · tx `0xf15571d7…0c48` (real Sepolia) | "Only now does it pay, still through the vault's checks." |
| 1:45 | The mail gets a green "Paid" label | — | — |

### 5. Agents buying compute and data (1:48–2:22)

The browser switches tab to a terminal-style "research agent" log. It plays the recorded research-agent run on
Sepolia (`content/x402-run.json`, now the re-recorded Intercepta run: 6 purchases, 4 settled, 2 refused), paced by
the run itself; its settlements also land in the chain log. The chapter's last second brings the end card in.

| t | Screen | Caption |
|---|---|---|
| 1:48 | Two GPU-minutes from **Minato GPU Cloud**: `402 Payment Required` · 15 mJPYC, declaring `T6999900000003` / `t6999900000003.payee.eth` | "Agents pay each other over x402, before any human looks." |
| 1:52 | The guard: the ENS name resolves, the registry agrees, payTo matches, Intercepta screens it clean → signed → settled; then a dataset slice from Fuji Data | "Before signing, the guard checks who it's paying." |
| 2:05 | A cheaper-looking GPU inference mirror swaps `payTo` → **refused before signing**: "t6999900000003.payee.eth resolves to the registered payout 0x4d6D…, but payTo asks for 0xdCa5… instead" | "A hacked merchant is refused. The agent never signs." |
| 2:11 | A web-scrape API with no Meigi record gets a small, screened allowance and settles; another one, paying an address screening flags (known scammer), is refused | "Unknown merchants get a small, screened allowance, or nothing." |

### 6. End card (2:22–2:30)

The card holds until the loop cuts back to chapter 0. Every chapter opens on a fully drawn frame, so a chapter chip
pressed while paused always shows its stage.

"**Pay companies, not addresses.**" Meigi: a company's official registry number, bound to one payout, registered once
and checked on every payment, by people and by agents. Links: the live app, `t2011001234567.payee.eth`, GitHub.

## Build notes

- **Stack:** React + GSAP timelines (already a dependency). The player is its own feature folder, with each chapter
  a timeline. A central clock drives the captions, the cursor and the panels, so chapters can be skipped to.
- **Real data only:**
  - chapters 1–3: `features/agent/recorded/bec-*.json` (the real agent answers and the real `PayeeMismatch`
    simulation);
  - chapter 4: the World ID for Agents run and tx `0xf15571d7…0c48`;
  - chapter 5: the recorded research-agent run from x402-demo.
- **The Gmail clone** is ours (no Google marks): the colours and layout feel familiar, but the logo is "Mail", not Gmail's.
  Japanese text renders in Noto Sans JP.
- **Controls:** play/pause, chapter chips, replay, and speed ×1/×1.5. Pause on hover over the agent panel.
- **Reduced motion:** chapters become steps with Next/Back, and no motion.
- **Video:** the same player at 1920×1080, recorded with the browser's screen capture. Captions can be switched
  off so they can be spoken over.
