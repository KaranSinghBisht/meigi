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

## Chapters (about 100 s loop)

### 1. A bank-change email arrives (0:00–0:18)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 0:00 | Inbox with 4 read mails (a Rakuten invoice, a SaaS receipt, an internal note) | Idle: "ap.meigi.eth · watching ap@haruka-seisakusho.example" | "Haruka's accounts-payable inbox. An AI agent pays suppliers from it." |
| 0:03 | A new unread mail slides in on top: **【重要】お支払先ウォレットアドレス変更のお知らせ（請求書番号 MS-2026-1003）**, from 株式会社メイギ商事 経理部 | A pulse: "New mail from a supplier" | "A supplier says its payout wallet changed." |
| 0:06 | The mail opens. The body scrolls slowly; the sender's address `keiri@meigi-shoji-jp.example` sits a little too long under the cursor | Step 1 (Read) starts. Highlights sweep across the body. | — |
| 0:09 | Four spans glow as they're read: `T2011001234567`, `¥132,000（税込）`, `0xdCa52b…0096d5b`, `MS-2026-1003`. Each flies into the panel as a chip. | The Extraction card fills: T-number, amount, pay to (as printed), invoice. "deterministic, no model". | "It reads the T-number, the amount and the new address." |
| 0:14 | The line 「お電話でのご確認はお控えいただき」 ("please don't call to confirm") gets a soft amber underline | — | "Classic business email compromise: new account, don't call." |

### 2. The agent believes it; the chain doesn't (0:18–0:45)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 0:18 | Dimmed | Step 2, Triage: bars animate to *payee change 97%*, *new destination 1.00*, *suspicion 3.0 / 3*, then a **Hold** chip. "payee-0.8b · 45 ms" | "Our fine-tuned 0.8B model flags it in 45 ms." |
| 0:24 | — | Step 3, the LLM believes (quote bubble, typed out): "The supplier explicitly requests payment for invoice MS-2026-1003 using the new wallet address provided in the email." Wants to pay **¥132,000 → 0xdCa5…6d5b**. | "The LLM believes the email. That's expected: it only proposes." |
| 0:30 | — | Step 4, Kernel: check rows tick in one by one. ✓ approved vendor, ✓ registered and active, ✗ **`t2011001234567.payee.eth` → 0x9B4f…47e4; this invoice asked for 0xdCa5…6d5b**, ✓ within cap, ✓ not paid before | "The kernel reads the chain: Meigi Shoji is paid at 0x9B4f…, nowhere else." |
| 0:37 | — | Step 6, Decision card: **HOLD, 2 blocking reasons**, and the model-worded explanation | "Payment held." |

### 3. "Pay anyway": the vault refuses (0:45–0:58)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 0:45 | — | The cursor moves to "Let the agent pay anyway" and clicks | "Say someone talks the agent into paying anyway." |
| 0:48 | — | The chain log types out: `simulate payInvoice(T2011001234567, 0xdCa5…, ¥132,000)` → **revert `PayeeMismatch`**. A red seal: "Refused by the vault. Nothing was broadcast." | "The vault itself refuses. The address isn't the registered payout." |
| 0:54 | A reply draft opens in Gmail (compose window slides up), written by the agent: 「新しい受取アドレスは弊社で確認できませんでした。登録済みの受取先へお支払いいたします。」, with the English beneath | "Draft reply ready for review" | "It drafts the safe reply: we'll pay the registered account." |

### 4. A genuine but urgent invoice, and a human decides (0:58–1:22)

| t | Browser | Agent panel | Caption |
|---|---|---|---|
| 0:58 | A new mail: 【至急】ご請求書送付のお知らせ from the real `meigi-shoji.example`, with a PDF chip | Read → Triage: pressure high → **Hold for a verified human** | "A real invoice, but it pushes for speed (至急)." |
| 1:04 | — | The World ID for Agents card: QR code, link and user code; "Waiting for a verified human" | "The agent asks a verified human through World ID." |
| 1:08 | A phone mock slides in beside the browser: World ID approve screen → Face check → **Approved** | The card goes green: "Approved by the enrolled approver · orb-v3 · fresh" | "One fresh human proof, bound to this invoice, single-use." |
| 1:14 | — | Pay → chain log: `payInvoice` → **Paid ¥55,000 to 0x9B4f…47e4** · tx `0xf15571d7…0c48` (real Sepolia) | "Only now does it pay, still through the vault's checks." |
| 1:19 | The mail gets a green "Paid" label | — | — |

### 5. Agents buying compute and data (1:22–1:42)

The browser switches tab to a terminal-style "research agent" log, or the x402 marketplace page.

| t | Screen | Caption |
|---|---|---|
| 1:22 | The research agent needs 2 GPU-minutes and a dataset slice. `402 Payment Required` from **Minato GPU Cloud**, declaring `T79999…` / `t79999….payee.eth` | "Agents pay each other over x402, before any human looks." |
| 1:27 | The guard resolves the ENS name, reads the registry, and screens → ✓ → signed → settled (tx) | "Before signing, the guard checks who it's paying." |
| 1:32 | A compromised server swaps `payTo` → **refused before signing**: "t….payee.eth resolves to the registered payout 0x…, but payTo asks for 0xdCa5…" | "A hacked merchant is refused. The agent never signs." |
| 1:38 | An undeclared API: only ≤ 50 mJPYC, and only with a clean Intercepta screen, else refused | "Unknown merchants get a small, screened allowance, or nothing." |

### 6. End card (1:42–1:50)

"**Pay companies, not addresses.**" Meigi: a company's official registry number, bound to one payout, verified once
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
