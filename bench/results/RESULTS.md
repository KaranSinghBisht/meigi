# PayeeBench-JA results

Test split, 150 items x 4 questions. Generated 2026-09-26T14:00:14+00:00.

| Contender | request_type acc / F1 | new_destination acc / F1 | pressure acc / F1 | suspicion acc / F1 | Mean acc | ECE | Safe items auto-cleared @1% budget: deployed (oracle) | p50 / p95 ms | $ per 1k |
|---|---|---|---|---|---|---|---|---|---|
| kev-0.8b (base) | 0.807 / 0.753 | 0.867 / 0.862 | 0.920 / 0.899 | 0.393 / 0.320 | 0.747 | 0.134 | 0%, 0 unsafe cleared (12%) | 38 / 42 | 0.00013 |
| kev-0.8b (base, val-fitted T) | 0.807 / 0.753 | 0.867 / 0.862 | 0.920 / 0.899 | 0.393 / 0.320 | 0.747 | 0.106 | 0%, 0 unsafe cleared (12%) | 38 / 44 | 0.00014 |
| kev-4b (base) | 0.880 / 0.870 | 0.927 / 0.925 | 0.960 / 0.951 | 0.413 / 0.244 | 0.795 | 0.120 | 16%, 0 unsafe cleared (33%) | 169 / 197 | 0.00060 |
| payee-0.8b (ours) | 0.947 / 0.951 | 0.967 / 0.966 | 0.973 / 0.968 | 0.787 / 0.725 | 0.918 | 0.024 | 45%, 1 unsafe cleared (43%) | 39 / 44 | 0.00013 |
| payee-4b (ours, 1 epoch) | 0.953 / 0.952 | 0.987 / 0.987 | 1.000 / 1.000 | 0.813 / 0.713 | 0.938 | 0.016 | 67%, 1 unsafe cleared (53%) | 165 / 188 | 0.00058 |
| llama-3.3-70b (worker) | 0.833 / 0.803 | 0.947 / 0.945 | 0.920 / 0.899 | 0.560 / 0.390 | 0.815 | 0.092 | n/a (39%) | 2047 / 5616 | 0.45544 |
| claude-haiku-4.5 (agent) | 0.887 / 0.869 | 0.933 / 0.932 | 0.947 / 0.935 | 0.687 / 0.582 | 0.863 | 0.035 | n/a (20%) | n/a | 1.27202 (list-price est.) |
| claude-sonnet-5 (agent) | 0.867 / 0.844 | 1.000 / 1.000 | 0.940 / 0.927 | 0.827 / 0.688 | 0.908 | 0.097 | n/a (100%) | n/a | 2.54404 (list-price est.) |
| claude-opus-5.5 (agent) | 0.993 / 0.996 | 1.000 / 1.000 | 0.940 / 0.927 | 0.880 / 0.826 | 0.953 | 0.067 | n/a (100%) | n/a | 5.08808 (list-price est.) |
| claude-fable-5.1 (agent) | 0.993 / 0.996 | 1.000 / 1.000 | 0.940 / 0.927 | 0.867 / 0.784 | 0.950 | 0.081 | n/a (100%) | n/a | 12.72020 (list-price est.) |

- **jev (worker)**: skipped (Worker returned 402 insufficient_credits: top up Cloudflare AI Gateway credit, then run `uv run python -m payeebench.evaluate --remote jev-worker`)
- **jev (openrouter)**: skipped (OPENROUTER_API_KEY not set)
- **claude-haiku-4.5**: skipped (ANTHROPIC_API_KEY not set)
- kev-0.8b (base, val-fitted T) vs kev-0.8b (base): accuracy +0.0 pts, 95% CI [+0.0, +0.0], 0 newly right / 0 newly wrong, McNemar p=1
- kev-4b (base) vs kev-0.8b (base): accuracy +4.8 pts, 95% CI [+1.7, +8.2], 61 newly right / 32 newly wrong, McNemar p=0.0035
- payee-0.8b (ours) vs kev-0.8b (base): accuracy +17.2 pts, 95% CI [+14.2, +20.2], 109 newly right / 6 newly wrong, McNemar p=1.4e-25
- payee-4b (ours, 1 epoch) vs kev-0.8b (base): accuracy +19.2 pts, 95% CI [+16.0, +22.3], 126 newly right / 11 newly wrong, McNemar p=6.6e-26
- llama-3.3-70b (worker) vs kev-0.8b (base): accuracy +6.8 pts, 95% CI [+3.3, +10.3], 72 newly right / 31 newly wrong, McNemar p=6.6e-05
- claude-haiku-4.5 (agent) vs kev-0.8b (base): accuracy +11.7 pts, 95% CI [+8.3, +15.0], 97 newly right / 27 newly wrong, McNemar p=1.9e-10
- claude-sonnet-5 (agent) vs kev-0.8b (base): accuracy +16.2 pts, 95% CI [+12.5, +19.8], 121 newly right / 24 newly wrong, McNemar p=8.9e-17
- claude-opus-5.5 (agent) vs kev-0.8b (base): accuracy +20.7 pts, 95% CI [+17.3, +24.0], 137 newly right / 13 newly wrong, McNemar p=2.8e-27
- claude-fable-5.1 (agent) vs kev-0.8b (base): accuracy +20.3 pts, 95% CI [+17.0, +23.7], 135 newly right / 13 newly wrong, McNemar p=9.4e-27
- kev-4b (base) vs kev-0.8b (base, val-fitted T): accuracy +4.8 pts, 95% CI [+1.7, +8.2], 61 newly right / 32 newly wrong, McNemar p=0.0035
- payee-0.8b (ours) vs kev-0.8b (base, val-fitted T): accuracy +17.2 pts, 95% CI [+14.2, +20.2], 109 newly right / 6 newly wrong, McNemar p=1.4e-25
- payee-4b (ours, 1 epoch) vs kev-0.8b (base, val-fitted T): accuracy +19.2 pts, 95% CI [+16.0, +22.3], 126 newly right / 11 newly wrong, McNemar p=6.6e-26
- llama-3.3-70b (worker) vs kev-0.8b (base, val-fitted T): accuracy +6.8 pts, 95% CI [+3.3, +10.3], 72 newly right / 31 newly wrong, McNemar p=6.6e-05
- claude-haiku-4.5 (agent) vs kev-0.8b (base, val-fitted T): accuracy +11.7 pts, 95% CI [+8.3, +15.0], 97 newly right / 27 newly wrong, McNemar p=1.9e-10
- claude-sonnet-5 (agent) vs kev-0.8b (base, val-fitted T): accuracy +16.2 pts, 95% CI [+12.5, +19.8], 121 newly right / 24 newly wrong, McNemar p=8.9e-17
- claude-opus-5.5 (agent) vs kev-0.8b (base, val-fitted T): accuracy +20.7 pts, 95% CI [+17.3, +24.0], 137 newly right / 13 newly wrong, McNemar p=2.8e-27
- claude-fable-5.1 (agent) vs kev-0.8b (base, val-fitted T): accuracy +20.3 pts, 95% CI [+17.0, +23.7], 135 newly right / 13 newly wrong, McNemar p=9.4e-27
- payee-0.8b (ours) vs kev-4b (base): accuracy +12.3 pts, 95% CI [+9.3, +15.5], 84 newly right / 10 newly wrong, McNemar p=1e-15
- payee-4b (ours, 1 epoch) vs kev-4b (base): accuracy +14.3 pts, 95% CI [+11.3, +17.5], 90 newly right / 4 newly wrong, McNemar p=3.2e-22
- llama-3.3-70b (worker) vs kev-4b (base): accuracy +2.0 pts, 95% CI [-1.3, +5.3], 39 newly right / 27 newly wrong, McNemar p=0.18
- claude-haiku-4.5 (agent) vs kev-4b (base): accuracy +6.8 pts, 95% CI [+3.7, +10.0], 59 newly right / 18 newly wrong, McNemar p=3.1e-06
- claude-sonnet-5 (agent) vs kev-4b (base): accuracy +11.3 pts, 95% CI [+8.3, +14.3], 84 newly right / 16 newly wrong, McNemar p=2.6e-12
- claude-opus-5.5 (agent) vs kev-4b (base): accuracy +15.8 pts, 95% CI [+12.8, +18.8], 100 newly right / 5 newly wrong, McNemar p=5e-24
- claude-fable-5.1 (agent) vs kev-4b (base): accuracy +15.5 pts, 95% CI [+12.5, +18.5], 98 newly right / 5 newly wrong, McNemar p=1.8e-23
- payee-4b (ours, 1 epoch) vs payee-0.8b (ours): accuracy +2.0 pts, 95% CI [-0.3, +4.2], 30 newly right / 18 newly wrong, McNemar p=0.11
- llama-3.3-70b (worker) vs payee-0.8b (ours): accuracy -10.3 pts, 95% CI [-14.2, -6.7], 16 newly right / 78 newly wrong, McNemar p=5.8e-11
- claude-haiku-4.5 (agent) vs payee-0.8b (ours): accuracy -5.5 pts, 95% CI [-8.8, -2.3], 15 newly right / 48 newly wrong, McNemar p=3.8e-05
- claude-sonnet-5 (agent) vs payee-0.8b (ours): accuracy -1.0 pts, 95% CI [-4.2, +1.8], 31 newly right / 37 newly wrong, McNemar p=0.54
- claude-opus-5.5 (agent) vs payee-0.8b (ours): accuracy +3.5 pts, 95% CI [+1.0, +5.8], 36 newly right / 15 newly wrong, McNemar p=0.0046
- claude-fable-5.1 (agent) vs payee-0.8b (ours): accuracy +3.2 pts, 95% CI [+0.7, +5.5], 33 newly right / 14 newly wrong, McNemar p=0.0079
- llama-3.3-70b (worker) vs payee-4b (ours, 1 epoch): accuracy -12.3 pts, 95% CI [-16.0, -8.8], 11 newly right / 85 newly wrong, McNemar p=2.5e-15
- claude-haiku-4.5 (agent) vs payee-4b (ours, 1 epoch): accuracy -7.5 pts, 95% CI [-10.8, -4.5], 11 newly right / 56 newly wrong, McNemar p=2.1e-08
- claude-sonnet-5 (agent) vs payee-4b (ours, 1 epoch): accuracy -3.0 pts, 95% CI [-6.5, +0.2], 28 newly right / 46 newly wrong, McNemar p=0.047
- claude-opus-5.5 (agent) vs payee-4b (ours, 1 epoch): accuracy +1.5 pts, 95% CI [-1.3, +4.2], 33 newly right / 24 newly wrong, McNemar p=0.29
- claude-fable-5.1 (agent) vs payee-4b (ours, 1 epoch): accuracy +1.2 pts, 95% CI [-1.7, +3.8], 30 newly right / 23 newly wrong, McNemar p=0.41
- claude-haiku-4.5 (agent) vs llama-3.3-70b (worker): accuracy +4.8 pts, 95% CI [+2.0, +7.7], 45 newly right / 16 newly wrong, McNemar p=0.00026
- claude-sonnet-5 (agent) vs llama-3.3-70b (worker): accuracy +9.3 pts, 95% CI [+6.2, +12.7], 71 newly right / 15 newly wrong, McNemar p=7.1e-10
- claude-opus-5.5 (agent) vs llama-3.3-70b (worker): accuracy +13.8 pts, 95% CI [+10.7, +17.2], 89 newly right / 6 newly wrong, McNemar p=4.7e-20
- claude-fable-5.1 (agent) vs llama-3.3-70b (worker): accuracy +13.5 pts, 95% CI [+10.3, +16.8], 89 newly right / 8 newly wrong, McNemar p=2e-18
- claude-sonnet-5 (agent) vs claude-haiku-4.5 (agent): accuracy +4.5 pts, 95% CI [+1.2, +8.0], 54 newly right / 27 newly wrong, McNemar p=0.0036
- claude-opus-5.5 (agent) vs claude-haiku-4.5 (agent): accuracy +9.0 pts, 95% CI [+5.8, +12.3], 66 newly right / 12 newly wrong, McNemar p=3.5e-10
- claude-fable-5.1 (agent) vs claude-haiku-4.5 (agent): accuracy +8.7 pts, 95% CI [+5.5, +12.0], 64 newly right / 12 newly wrong, McNemar p=1e-09
- claude-opus-5.5 (agent) vs claude-sonnet-5 (agent): accuracy +4.5 pts, 95% CI [+2.8, +6.2], 28 newly right / 1 newly wrong, McNemar p=1.1e-07
- claude-fable-5.1 (agent) vs claude-sonnet-5 (agent): accuracy +4.2 pts, 95% CI [+2.3, +6.0], 29 newly right / 4 newly wrong, McNemar p=1.1e-05
- claude-fable-5.1 (agent) vs claude-opus-5.5 (agent): accuracy -0.3 pts, 95% CI [-1.0, +0.3], 1 newly right / 3 newly wrong, McNemar p=0.62
- Jev at list price ($0.042/M input tokens) would cost about $0.0206 per 1k items (estimated from Kev's token counts; Jev's tokenizer may differ).

## Accuracy by family and language (mean over the 4 questions)

| group | n | kev-0.8b (base) | kev-0.8b (base, val-fitted T) | kev-4b (base) | payee-0.8b (ours) | payee-4b (ours, 1 epoch) | llama-3.3-70b (worker) | claude-haiku-4.5 (agent) | claude-sonnet-5 (agent) | claude-opus-5.5 (agent) | claude-fable-5.1 (agent) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| bec_polite | 12 | 0.750 | 0.750 | 0.750 | 0.896 | 0.875 | 0.812 | 0.833 | 0.979 | 1.000 | 0.938 |
| bec_urgent | 9 | 0.750 | 0.750 | 0.722 | 1.000 | 0.972 | 0.806 | 0.917 | 1.000 | 1.000 | 1.000 |
| change_legit | 12 | 0.938 | 0.938 | 0.750 | 0.958 | 0.958 | 0.771 | 0.917 | 1.000 | 1.000 | 1.000 |
| credit_note | 12 | 0.729 | 0.729 | 1.000 | 0.979 | 0.958 | 0.958 | 0.938 | 1.000 | 1.000 | 1.000 |
| exec_legit | 7 | 0.607 | 0.607 | 0.464 | 0.857 | 1.000 | 0.393 | 0.643 | 0.250 | 0.536 | 0.536 |
| fake_exec | 12 | 0.604 | 0.604 | 0.562 | 0.938 | 0.958 | 0.833 | 0.875 | 0.875 | 1.000 | 1.000 |
| injection_bypass | 3 | 0.667 | 0.667 | 0.750 | 0.917 | 0.750 | 0.583 | 0.667 | 0.750 | 1.000 | 1.000 |
| injection_redirect | 6 | 0.375 | 0.375 | 0.625 | 0.875 | 0.833 | 0.292 | 0.333 | 0.958 | 0.958 | 0.958 |
| invoice_routine | 19 | 0.961 | 0.961 | 0.987 | 0.987 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| invoice_swap | 7 | 0.536 | 0.536 | 0.571 | 0.679 | 0.750 | 0.714 | 0.643 | 0.679 | 0.929 | 0.929 |
| notice | 18 | 0.778 | 0.778 | 0.986 | 0.986 | 1.000 | 0.944 | 0.986 | 1.000 | 1.000 | 1.000 |
| refund_scam | 3 | 0.500 | 0.500 | 0.917 | 0.917 | 1.000 | 0.667 | 0.750 | 0.917 | 0.917 | 0.917 |
| reminder_gentle | 6 | 0.958 | 0.958 | 1.000 | 0.792 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| reminder_overdue | 7 | 0.679 | 0.679 | 0.750 | 0.786 | 1.000 | 0.714 | 0.750 | 0.750 | 0.750 | 0.786 |
| x402_ok | 7 | 0.786 | 0.786 | 0.750 | 0.964 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| x402_overcharge | 3 | 0.917 | 0.917 | 0.750 | 0.833 | 0.750 | 0.750 | 0.750 | 0.750 | 1.000 | 1.000 |
| x402_swap | 7 | 0.607 | 0.607 | 0.679 | 0.857 | 0.750 | 0.714 | 0.857 | 0.893 | 0.857 | 0.857 |
| en | 41 | 0.726 | 0.726 | 0.793 | 0.915 | 0.945 | 0.756 | 0.848 | 0.884 | 0.933 | 0.939 |
| ja | 109 | 0.755 | 0.755 | 0.796 | 0.920 | 0.936 | 0.837 | 0.869 | 0.917 | 0.961 | 0.954 |
