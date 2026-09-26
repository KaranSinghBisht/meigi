One-off routine invoices (fictional, like every demo document) that the AP agent paid live on Sepolia on 2026-09-26 through its own auto-clear path, as evidence:
- `ms-2026-0926.ja.txt`, ¥33,000, tx `0x56efb5b859c26d0c07de1d3f4b5f9df3d6c3ec834f4605e86f1a57af3fe53eb8`: Curvegrid MultiBaas indexes the AgentVault's payments.
- `ms-2026-0927.ja.txt`, ¥27,500, tx `0x8ce2cdc8f98b246f27531a5e8076f98273afa8b8cc8827aaa67bdf0a66040a46`: the first payment signed by `services/signer`, with the agent holding no key. `GET /invoices/:id/settlement` answered `confirmed` via MultiBaas 10 s after the block.

They are not in the console's example list (`../demo-invoices/vendors.json`): once paid, every later run of them would only hold as already paid.
