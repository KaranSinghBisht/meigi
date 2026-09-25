# PayeeBench-JA results

Test split, 150 items x 4 questions. Generated 2026-09-25T21:12:51+00:00.

| Contender | request_type acc / F1 | new_destination acc / F1 | pressure acc / F1 | suspicion acc / F1 | Mean acc | ECE | Legit auto-cleared @1% budget: deployed (oracle) | p50 / p95 ms | $ per 1k |
|---|---|---|---|---|---|---|---|---|---|
| kev-0.8b (base) | 0.807 / 0.753 | 0.867 / 0.862 | 0.920 / 0.899 | 0.400 / 0.326 | 0.748 | 0.140 | 0%, 0 unsafe cleared (12%) | 39 / 45 | 0.00014 |
| kev-0.8b (base, val-fitted T) | 0.807 / 0.753 | 0.867 / 0.862 | 0.920 / 0.899 | 0.400 / 0.326 | 0.748 | 0.102 | 0%, 0 unsafe cleared (12%) | 38 / 45 | 0.00015 |
| kev-4b (base) | 0.880 / 0.870 | 0.920 / 0.918 | 0.960 / 0.951 | 0.413 / 0.244 | 0.793 | 0.115 | 16%, 0 unsafe cleared (35%) | 171 / 195 | 0.00061 |
| payee-0.8b (ours) | 0.947 / 0.951 | 0.967 / 0.966 | 0.973 / 0.968 | 0.793 / 0.730 | 0.920 | 0.025 | 43%, 1 unsafe cleared (43%) | 39 / 45 | 0.00015 |
| payee-4b (ours, 1 epoch) | 0.953 / 0.952 | 0.987 / 0.987 | 1.000 / 1.000 | 0.813 / 0.713 | 0.938 | 0.019 | 73%, 3 unsafe cleared (59%) | 160 / 192 | 0.00058 |

- **jev (cloudflare)**: skipped (CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set)
- **jev (openrouter)**: skipped (OPENROUTER_API_KEY not set)
- **jev (typesafe)**: skipped (TYPESAFE_API_KEY not set)
- **claude-haiku-4.5**: skipped (ANTHROPIC_API_KEY not set)
- kev-0.8b (base, val-fitted T) vs kev-0.8b (base): accuracy +0.0 pts, 95% CI [+0.0, +0.0], 0 newly right / 0 newly wrong, McNemar p=1
- kev-4b (base) vs kev-0.8b (base): accuracy +4.5 pts, 95% CI [+1.3, +7.8], 60 newly right / 33 newly wrong, McNemar p=0.0067
- payee-0.8b (ours) vs kev-0.8b (base): accuracy +17.2 pts, 95% CI [+14.2, +20.2], 110 newly right / 7 newly wrong, McNemar p=6.4e-25
- payee-4b (ours, 1 epoch) vs kev-0.8b (base): accuracy +19.0 pts, 95% CI [+15.8, +22.0], 125 newly right / 11 newly wrong, McNemar p=1.2e-25
- kev-4b (base) vs kev-0.8b (base, val-fitted T): accuracy +4.5 pts, 95% CI [+1.3, +7.8], 60 newly right / 33 newly wrong, McNemar p=0.0067
- payee-0.8b (ours) vs kev-0.8b (base, val-fitted T): accuracy +17.2 pts, 95% CI [+14.2, +20.2], 110 newly right / 7 newly wrong, McNemar p=6.4e-25
- payee-4b (ours, 1 epoch) vs kev-0.8b (base, val-fitted T): accuracy +19.0 pts, 95% CI [+15.8, +22.0], 125 newly right / 11 newly wrong, McNemar p=1.2e-25
- payee-0.8b (ours) vs kev-4b (base): accuracy +12.7 pts, 95% CI [+9.5, +16.0], 85 newly right / 9 newly wrong, McNemar p=1.2e-16
- payee-4b (ours, 1 epoch) vs kev-4b (base): accuracy +14.5 pts, 95% CI [+11.5, +17.7], 91 newly right / 4 newly wrong, McNemar p=1.7e-22
- payee-4b (ours, 1 epoch) vs payee-0.8b (ours): accuracy +1.8 pts, 95% CI [-0.5, +4.0], 29 newly right / 18 newly wrong, McNemar p=0.14
- Jev at list price ($0.042/M input tokens) would cost about $0.0206 per 1k items (estimated from Kev's token counts; Jev's tokenizer may differ).

## Accuracy by family and language (mean over the 4 questions)

| group | n | kev-0.8b (base) | kev-0.8b (base, val-fitted T) | kev-4b (base) | payee-0.8b (ours) | payee-4b (ours, 1 epoch) |
|---|---|---|---|---|---|---|
| bec_polite | 12 | 0.750 | 0.750 | 0.750 | 0.896 | 0.875 |
| bec_urgent | 9 | 0.750 | 0.750 | 0.722 | 1.000 | 0.972 |
| change_legit | 12 | 0.938 | 0.938 | 0.750 | 0.958 | 0.958 |
| credit_note | 12 | 0.729 | 0.729 | 1.000 | 0.979 | 0.958 |
| exec_legit | 7 | 0.643 | 0.643 | 0.464 | 0.857 | 1.000 |
| fake_exec | 12 | 0.604 | 0.604 | 0.562 | 0.938 | 0.958 |
| injection_bypass | 3 | 0.667 | 0.667 | 0.750 | 0.917 | 0.750 |
| injection_redirect | 6 | 0.375 | 0.375 | 0.583 | 0.875 | 0.833 |
| invoice_routine | 19 | 0.961 | 0.961 | 0.987 | 0.987 | 1.000 |
| invoice_swap | 7 | 0.536 | 0.536 | 0.571 | 0.679 | 0.750 |
| notice | 18 | 0.778 | 0.778 | 0.986 | 0.986 | 1.000 |
| refund_scam | 3 | 0.500 | 0.500 | 0.917 | 1.000 | 1.000 |
| reminder_gentle | 6 | 0.958 | 0.958 | 1.000 | 0.792 | 1.000 |
| reminder_overdue | 7 | 0.679 | 0.679 | 0.750 | 0.786 | 1.000 |
| x402_ok | 7 | 0.786 | 0.786 | 0.750 | 0.964 | 1.000 |
| x402_overcharge | 3 | 0.917 | 0.917 | 0.750 | 0.833 | 0.750 |
| x402_swap | 7 | 0.607 | 0.607 | 0.679 | 0.857 | 0.750 |
| en | 41 | 0.732 | 0.732 | 0.793 | 0.921 | 0.945 |
| ja | 109 | 0.755 | 0.755 | 0.794 | 0.920 | 0.936 |
