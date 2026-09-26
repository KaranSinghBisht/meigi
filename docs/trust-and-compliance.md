# Trust and compliance

What Meigi proves today, what it doesn't, and what production needs: our own due diligence, not legal advice.
Before launch we'd seek an FSA no-action letter (法令適用事前確認手続) [1].

## What a registration proves today

- The number and the exact legal name match the NTA corporate registry (法人番号, 5,787,472 corporations).
- The registrant controls *a* domain: a DNS TXT record carries a challenge signed by the business key.
- Unique humans enrolled with World ID as that number's officers.

It does **not** prove that the registrant represents the company. That binding, through the 商業登記電子証明書, is the
production step (roadmap, item 1).

## Threat model

**First-claim squatting.**
- A company's T-number and exact name are public; they're on its invoices.
- The DNS proof accepts any domain the registrant controls, and any unique human can enroll as an officer.
- On-chain, `register` takes effect at once, so ENS, `PayRouter` and the x402 guard would all point at a squatter.
- *What covers it:* a later claim freezes the number instead of overwriting it, and a vault owner who checks the
  pinned payout independently would notice. The verifier also caps each World ID officer at 3 companies, and can
  hold new registrations in a public window where anyone can object (0h in the demo, 24–72h in production).
- *What doesn't:* a company that never looks, a squatter with several humans, or payments made before a freeze.
  The limits are the attester's off-chain policy; the contract doesn't enforce them.

**Freeze griefing.**
- Any claim that passes the same checks freezes the incumbent. Payments to it fail closed, so no money is
  misdirected, until governance dismisses the claim.
- Each World ID officer can claim at most 3 companies, and each client IP can file 3 disputes an hour. An attacker
  with several humans or IPs can still freeze payees, and the caps are off-chain.

**The hot attester key.**
- One attester signs with a key held in the verifier's environment. A thief could:
  - register unclaimed numbers;
  - freeze payees;
  - sign officer approvals that queue controller rotations.
- *What covers it:* the key can't change a payout alone (that needs the controller). Rotations wait 72h in public,
  and the controller, an attester or governance can cancel them. Revoking the attester is permanent and voids what
  it queued.
- *What doesn't:* squats and freezes take effect at once.

**EOA owners.**
- An EOA owns the registry (attesters, dispute rulings), and an EOA owns `payee.eth`, which could re-point every name
  at once with no timelock.
- The x402 guard fails closed, because the registry, ENS and `payTo` must agree. Wallets that trust ENS alone
  wouldn't.

**DNS.**
- The verifier reads TXT records from one resolver without DNSSEC validation, so a hijacked zone would pass.
- The `.well-known` fallback proves control of a web server, not of a company.

## Our posture

**Non-custodial by design.**
- Meigi never holds keys or funds. The registry is public information, each payer deploys and owns its AgentVault,
  and the AP agent runs on the payer's machine with a local LLM.
- We don't trade, intermediate or manage electronic payment instruments (EPIs) for others. Those activities make up
  電子決済手段等取引業 (PSA Art. 2(10)) [2]. Holding customers' agent keys could count as managing EPIs, so we won't.
- The 2025 amendment created a registered intermediary business (Art. 2(18)) [2][3], so we take no JPYC referral
  fees.
- The same amendment brought cross-border collection agents under fund-transfer rules (Art. 2-2) [2][3]. So
  `PayRouter` moves tokens from the payer straight to the registered payout in one `safeTransferFrom`, and never
  holds funds.

**AML and the travel rule.**
- EPI providers are specified business operators under the APTCP (Art. 2(2)(31-2)) [4].
- Their travel rule (Art. 10-3) applies when the beneficiary is another provider's customer [4]. A payment between
  two companies' own wallets carries no beneficiary information at all. That is the gap Meigi fills.
- Meigi isn't a specified business operator, and nor is a company paying its suppliers. Still, our registration is
  weaker than the APTCP's own remote KYB for companies [5]; roadmap item 1 closes that gap.

**Sanctions.**
- Under FEFTA Art. 16 measures, paying a designated party needs a permit. Banks and fund-transfer, EPI and crypto
  providers must check this (Arts. 17, 17-3, 17-4) [6], but a payment between self-hosted wallets has no
  intermediary to do it.
- Today we screen addresses only, with Intercepta, not legal names against the Ministry of Finance's list.

**Personal data (APPI).**
- Corporations aren't personal information (Art. 2(1)) [7], and the verifier only accepts numbers in the 法人番号
  registry (apart from fictional demo fixtures).
- A sole proprietor's name plus T-number is personal information; the NTA leaves individuals' names out of its bulk
  downloads [8].
- On-chain data can't be deleted and is replicated abroad (Art. 28) [7], so sole proprietors stay off-chain.
- Officer sets store `keccak256(session_id)` today. A company could match those to its own people, so production
  stores salted commitments.

**Invoice status.**
- We match the 法人番号 registry, not the qualified-invoice issuer registry with its 登録/失効/取消 status [8].
- Corporations that never registered as issuers, or were cancelled, currently pass.

**Liability.**
- Civil Code Art. 478: paying someone who merely appears entitled discharges the debt only if the payer acted in good
  faith and without negligence [9]. Whether relying on Meigi meets that bar is untested.
- Either way, a wrong entry would likely come back to us, in tort (Art. 709) or contract [9]. Production needs B2B
  terms with liability caps, and insurance.
- Under the EU's Verification of Payee (VoP), a PSP that fails to verify refunds the payer (Reg. (EU) 2024/886,
  Art. 5c(8)) [10].

**Advisory mode or hard revert.**
- EU VoP, mandatory for euro-area PSPs since 9 Oct 2025, must not "prevent payers from authorising" (Art. 5c(5))
  [10]. It doesn't cover stablecoins.
- An AI agent can't weigh a warning, so the AgentVault and the x402 guard hard-fail. People paying from a wallet
  should get a VoP-style advisory mode: warn, and allow an override.

## Production roadmap

1. **Representative binding.**
   - The company's registered representative signs the binding (T-number, payout, chain, nonce) with the
     商業登記電子証明書: method (ホ), which the APTCP ordinance accepts for remote KYB of companies (Art. 6(1)(iii)) [5].
   - The certificate records the company's 商号, 本店 and representative. Anyone can check its validity online, free
     and in real time, even as of a past moment; it's void once those details change [11].
   - Remote signing, through a gBizID account, has run since 21 Jul 2026 [12]. A certificate costs ¥500–8,300 [13].
   - 商号 plus 本店 is unique by law (Commercial Registration Act Art. 27) [14], so it maps to one corporate number.
   - *Fallback:* method (ハ), meaning the published corporate data plus a one-time code sent by registered,
     non-forwardable mail to the NTA-listed head office [5].
   - *Officers other than the representative* have their authority checked per Art. 12(5): a registered officer, a
     power of attorney, or a call-back to the head office [5].
2. **gBizINFO URL cross-check.**
   - METI's gBizINFO has a 企業ホームページ field (`company_url`, with per-field source metadata); its API needs a
     token [15].
   - Our 26 Sep 2026 spot check found it filled for 3 of 8 companies (each from MHLW's 職場情報総合サイト) and empty
     for 5, including Sony Group.
   - METI doesn't guarantee accuracy [16], so a match supports a registration and a missing URL counts for nothing.
3. **An on-chain pending window.** The verifier's objection window (above) moves into the registry, so a new number
   resolves to nothing until its window ends.
4. **Keys.**
   - k-of-n attesters with HSM or MPC custody.
   - The registry owner and `payee.eth` on a multisig behind a 72h timelock.
   - DNSSEC validation from several vantage points.
5. **Assurance.**
   - Planned: an independent audit, formal verification of the timelock invariant, and a public bug bounty.
   - So far: three AI-assisted review rounds with proof-of-concept exploits, mutation-tested fixes, and 95 fuzzed
     Foundry tests. That is not a professional audit.
6. **Limits on-chain.** The verifier already caps each World ID officer (3 companies, 1 open claim per number) and
   each client IP per hour. Production adds on-chain registration caps, and requires representative binding before
   anyone can freeze an incumbent.
7. **Screening and status.**
   - Screen legal names against MOF's FEFTA list at registration and on each list update.
   - Read the qualified-invoice status from NTA data.

## Sources

1. FSA, no-action letter system: https://www.fsa.go.jp/common/noact/index.html
2. Payment Services Act (資金決済法): https://laws.e-gov.go.jp/law/421AC0000000059
3. FSA, outline of the 2025 PSA amendment: https://www.fsa.go.jp/common/diet/217/02/gaiyou.pdf
4. Act on Prevention of Transfer of Criminal Proceeds (APTCP): https://laws.e-gov.go.jp/law/419AC0000000022
5. APTCP Enforcement Ordinance (施行規則): https://laws.e-gov.go.jp/law/420M60000F5A001
6. Foreign Exchange and Foreign Trade Act (FEFTA): https://laws.e-gov.go.jp/law/324AC0000000228
7. Act on the Protection of Personal Information (APPI): https://laws.e-gov.go.jp/law/415AC0000000057
8. NTA, qualified-invoice issuer data downloads: https://www.invoice-kohyo.nta.go.jp/download/index.html
9. Civil Code: https://laws.e-gov.go.jp/law/129AC0000000089
10. Regulation (EU) 2024/886: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32024R0886
11. MOJ, 商業登記に基づく電子認証制度: https://www.moj.go.jp/ONLINE/CERTIFICATION/GUIDE/guide03.html
12. MOJ, 商業登記リモート署名: https://www.moj.go.jp/MINJI/minji06_00236.html
13. MOJ, 商業登記電子証明書 fees: https://www.moj.go.jp/ONLINE/CERTIFICATION/index.html
14. Commercial Registration Act (商業登記法): https://laws.e-gov.go.jp/law/338AC0000000125
15. gBizINFO API: https://content.info.gbiz.go.jp/api/index.html
16. gBizINFO data sources and API terms: https://help.info.gbiz.go.jp/hc/ja/articles/4795050523806,
    https://help.info.gbiz.go.jp/hc/ja/articles/4999421139102
