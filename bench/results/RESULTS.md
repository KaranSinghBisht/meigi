# PayeeBench-JA results

Test split, 150 items x 4 questions. Generated 2026-09-26T15:19:49+00:00.

| Contender | request_type acc / F1 | new_destination acc / F1 | pressure acc / F1 | suspicion acc / F1 | Mean acc | ECE | Safe items auto-cleared @1% budget: deployed (oracle) | p50 / p95 ms | $ per 1k |
|---|---|---|---|---|---|---|---|---|---|
| kev-0.8b (base) | 0.807 / 0.753 | 0.867 / 0.862 | 0.920 / 0.899 | 0.393 / 0.320 | 0.747 | 0.134 | 0%, 0 held let through (12%) | 38 / 42 | 0.00013 |
| kev-0.8b (base, val-fitted T) | 0.807 / 0.753 | 0.867 / 0.862 | 0.920 / 0.899 | 0.393 / 0.320 | 0.747 | 0.106 | 0%, 0 held let through (12%) | 38 / 44 | 0.00014 |
| kev-4b (base) | 0.880 / 0.870 | 0.927 / 0.925 | 0.960 / 0.951 | 0.413 / 0.244 | 0.795 | 0.120 | 16%, 0 held let through (33%) | 169 / 197 | 0.00060 |
| payee-0.8b (ours) | 0.947 / 0.951 | 0.967 / 0.966 | 0.973 / 0.968 | 0.787 / 0.725 | 0.918 | 0.024 | 45%, 1 held let through (43%) | 39 / 44 | 0.00013 |
| payee-4b (ours, 1 epoch) | 0.953 / 0.952 | 0.987 / 0.987 | 1.000 / 1.000 | 0.813 / 0.713 | 0.938 | 0.016 | 67%, 1 held let through (53%) | 165 / 188 | 0.00058 |
| llama-3.3-70b (worker) | 0.833 / 0.803 | 0.947 / 0.945 | 0.920 / 0.899 | 0.560 / 0.390 | 0.815 | 0.092 | n/a (39%) | 2047 / 5616 | 0.45544 |
| llama-3.2-3b-payee (ours) | 0.887 / 0.854 | 0.993 / 0.993 | 0.933 / 0.917 | 0.713 / 0.604 | 0.882 | 0.033 | 27%, 4 held let through (20%) | n/a | n/a |
| gemma-4-e2b-payee (ours) | 0.880 / 0.914 | 0.987 / 0.987 | 0.920 / 0.912 | 0.807 / 0.714 | 0.898 | 0.050 | 61%, 1 held let through (41%) | n/a | n/a |

## Claude models run as Claude Code agents (indicative)

Each model answered the 150 test items as a Claude Code agent over the label-free kit (`payeebench.external kit`), reading about 5-10 items per step in one session (Haiku 4.5: three sessions of 50), not in one independent call per item. They got the same system prompt and user messages as Llama and never revised an answer; a first Haiku run that wrote a keyword classifier was discarded. With no validation run, auto-clear is the oracle rate only, an upper bound. Cost is the list price of Llama's token counts; latency was not measured. Details: `paper/frontier-protocol.md`.

| Contender | request_type acc / F1 | new_destination acc / F1 | pressure acc / F1 | suspicion acc / F1 | Mean acc | ECE | Safe items auto-cleared @1% budget: deployed (oracle) | p50 / p95 ms | $ per 1k |
|---|---|---|---|---|---|---|---|---|---|
| claude-haiku-4.5 (agent) | 0.887 / 0.869 | 0.933 / 0.932 | 0.947 / 0.935 | 0.687 / 0.582 | 0.863 | 0.035 | n/a (20%) | n/a | 1.27202 (list-price est.) |
| claude-sonnet-5 (agent) | 0.867 / 0.844 | 1.000 / 1.000 | 0.940 / 0.927 | 0.827 / 0.688 | 0.908 | 0.097 | n/a (100%) | n/a | 2.54404 (list-price est.) |
| claude-opus-5.5 (agent) | 0.993 / 0.996 | 1.000 / 1.000 | 0.940 / 0.927 | 0.880 / 0.826 | 0.953 | 0.067 | n/a (100%) | n/a | 5.08808 (list-price est.) |
| claude-fable-5.1 (agent) | 0.993 / 0.996 | 1.000 / 1.000 | 0.940 / 0.927 | 0.867 / 0.784 | 0.950 | 0.081 | n/a (100%) | n/a | 12.72020 (list-price est.) |

- **jev (worker)**: skipped (Worker returned 402 insufficient_credits: top up Cloudflare AI Gateway credit, then run `uv run python -m payeebench.evaluate --remote jev-worker`)
- **jev (openrouter)**: skipped (OPENROUTER_API_KEY not set)
- **claude-haiku-4.5**: skipped (ANTHROPIC_API_KEY not set)
- kev-0.8b (base, val-fitted T) vs kev-0.8b (base): accuracy +0.0 pts, 95% CI [+0.0, +0.0], 0 newly right / 0 newly wrong, McNemar p=1; items better / worse 0 / 0, sign test p=1
- kev-4b (base) vs kev-0.8b (base): accuracy +4.8 pts, 95% CI [+1.7, +8.2], 61 newly right / 32 newly wrong, McNemar p=0.0035; items better / worse 46 / 23, sign test p=0.0076
- payee-0.8b (ours) vs kev-0.8b (base): accuracy +17.2 pts, 95% CI [+14.2, +20.2], 109 newly right / 6 newly wrong, McNemar p=1.4e-25; items better / worse 91 / 6, sign test p=1.3e-20
- payee-4b (ours, 1 epoch) vs kev-0.8b (base): accuracy +19.2 pts, 95% CI [+16.0, +22.3], 126 newly right / 11 newly wrong, McNemar p=6.6e-26; items better / worse 94 / 4, sign test p=2.4e-23
- llama-3.3-70b (worker) vs kev-0.8b (base): accuracy +6.8 pts, 95% CI [+3.3, +10.3], 72 newly right / 31 newly wrong, McNemar p=6.6e-05; items better / worse 60 / 21, sign test p=1.7e-05
- claude-haiku-4.5 (agent) vs kev-0.8b (base): accuracy +11.7 pts, 95% CI [+8.3, +15.0], 97 newly right / 27 newly wrong, McNemar p=1.9e-10; items better / worse 74 / 13, sign test p=1.6e-11
- claude-sonnet-5 (agent) vs kev-0.8b (base): accuracy +16.2 pts, 95% CI [+12.5, +19.8], 121 newly right / 24 newly wrong, McNemar p=8.9e-17; items better / worse 89 / 8, sign test p=2e-18
- claude-opus-5.5 (agent) vs kev-0.8b (base): accuracy +20.7 pts, 95% CI [+17.3, +24.0], 137 newly right / 13 newly wrong, McNemar p=2.8e-27; items better / worse 97 / 3, sign test p=2.6e-25
- claude-fable-5.1 (agent) vs kev-0.8b (base): accuracy +20.3 pts, 95% CI [+17.0, +23.7], 135 newly right / 13 newly wrong, McNemar p=9.4e-27; items better / worse 95 / 3, sign test p=9.9e-25
- llama-3.2-3b-payee (ours) vs kev-0.8b (base): accuracy +13.5 pts, 95% CI [+9.3, +17.7], 118 newly right / 37 newly wrong, McNemar p=4.7e-11; items better / worse 82 / 28, sign test p=2.5e-07
- gemma-4-e2b-payee (ours) vs kev-0.8b (base): accuracy +15.2 pts, 95% CI [+10.7, +19.5], 132 newly right / 41 newly wrong, McNemar p=2.4e-12; items better / worse 88 / 19, sign test p=8.5e-12
- kev-4b (base) vs kev-0.8b (base, val-fitted T): accuracy +4.8 pts, 95% CI [+1.7, +8.2], 61 newly right / 32 newly wrong, McNemar p=0.0035; items better / worse 46 / 23, sign test p=0.0076
- payee-0.8b (ours) vs kev-0.8b (base, val-fitted T): accuracy +17.2 pts, 95% CI [+14.2, +20.2], 109 newly right / 6 newly wrong, McNemar p=1.4e-25; items better / worse 91 / 6, sign test p=1.3e-20
- payee-4b (ours, 1 epoch) vs kev-0.8b (base, val-fitted T): accuracy +19.2 pts, 95% CI [+16.0, +22.3], 126 newly right / 11 newly wrong, McNemar p=6.6e-26; items better / worse 94 / 4, sign test p=2.4e-23
- llama-3.3-70b (worker) vs kev-0.8b (base, val-fitted T): accuracy +6.8 pts, 95% CI [+3.3, +10.3], 72 newly right / 31 newly wrong, McNemar p=6.6e-05; items better / worse 60 / 21, sign test p=1.7e-05
- claude-haiku-4.5 (agent) vs kev-0.8b (base, val-fitted T): accuracy +11.7 pts, 95% CI [+8.3, +15.0], 97 newly right / 27 newly wrong, McNemar p=1.9e-10; items better / worse 74 / 13, sign test p=1.6e-11
- claude-sonnet-5 (agent) vs kev-0.8b (base, val-fitted T): accuracy +16.2 pts, 95% CI [+12.5, +19.8], 121 newly right / 24 newly wrong, McNemar p=8.9e-17; items better / worse 89 / 8, sign test p=2e-18
- claude-opus-5.5 (agent) vs kev-0.8b (base, val-fitted T): accuracy +20.7 pts, 95% CI [+17.3, +24.0], 137 newly right / 13 newly wrong, McNemar p=2.8e-27; items better / worse 97 / 3, sign test p=2.6e-25
- claude-fable-5.1 (agent) vs kev-0.8b (base, val-fitted T): accuracy +20.3 pts, 95% CI [+17.0, +23.7], 135 newly right / 13 newly wrong, McNemar p=9.4e-27; items better / worse 95 / 3, sign test p=9.9e-25
- llama-3.2-3b-payee (ours) vs kev-0.8b (base, val-fitted T): accuracy +13.5 pts, 95% CI [+9.3, +17.7], 118 newly right / 37 newly wrong, McNemar p=4.7e-11; items better / worse 82 / 28, sign test p=2.5e-07
- gemma-4-e2b-payee (ours) vs kev-0.8b (base, val-fitted T): accuracy +15.2 pts, 95% CI [+10.7, +19.5], 132 newly right / 41 newly wrong, McNemar p=2.4e-12; items better / worse 88 / 19, sign test p=8.5e-12
- payee-0.8b (ours) vs kev-4b (base): accuracy +12.3 pts, 95% CI [+9.3, +15.5], 84 newly right / 10 newly wrong, McNemar p=1e-15; items better / worse 68 / 10, sign test p=9.7e-12
- payee-4b (ours, 1 epoch) vs kev-4b (base): accuracy +14.3 pts, 95% CI [+11.3, +17.5], 90 newly right / 4 newly wrong, McNemar p=3.2e-22; items better / worse 72 / 3, sign test p=3.7e-18
- llama-3.3-70b (worker) vs kev-4b (base): accuracy +2.0 pts, 95% CI [-1.3, +5.3], 39 newly right / 27 newly wrong, McNemar p=0.18; items better / worse 33 / 20, sign test p=0.098
- claude-haiku-4.5 (agent) vs kev-4b (base): accuracy +6.8 pts, 95% CI [+3.7, +10.0], 59 newly right / 18 newly wrong, McNemar p=3.1e-06; items better / worse 50 / 12, sign test p=1.2e-06
- claude-sonnet-5 (agent) vs kev-4b (base): accuracy +11.3 pts, 95% CI [+8.3, +14.3], 84 newly right / 16 newly wrong, McNemar p=2.6e-12; items better / worse 67 / 7, sign test p=2.1e-13
- claude-opus-5.5 (agent) vs kev-4b (base): accuracy +15.8 pts, 95% CI [+12.8, +18.8], 100 newly right / 5 newly wrong, McNemar p=5e-24; items better / worse 79 / 3, sign test p=3.8e-20
- claude-fable-5.1 (agent) vs kev-4b (base): accuracy +15.5 pts, 95% CI [+12.5, +18.5], 98 newly right / 5 newly wrong, McNemar p=1.8e-23; items better / worse 77 / 3, sign test p=1.4e-19
- llama-3.2-3b-payee (ours) vs kev-4b (base): accuracy +8.7 pts, 95% CI [+4.3, +13.0], 92 newly right / 40 newly wrong, McNemar p=7e-06; items better / worse 59 / 30, sign test p=0.0028
- gemma-4-e2b-payee (ours) vs kev-4b (base): accuracy +10.3 pts, 95% CI [+5.8, +14.7], 105 newly right / 43 newly wrong, McNemar p=3.6e-07; items better / worse 61 / 13, sign test p=1.4e-08
- payee-4b (ours, 1 epoch) vs payee-0.8b (ours): accuracy +2.0 pts, 95% CI [-0.3, +4.2], 30 newly right / 18 newly wrong, McNemar p=0.11; items better / worse 25 / 14, sign test p=0.11
- llama-3.3-70b (worker) vs payee-0.8b (ours): accuracy -10.3 pts, 95% CI [-14.2, -6.7], 16 newly right / 78 newly wrong, McNemar p=5.8e-11; items better / worse 14 / 58, sign test p=1.6e-07
- claude-haiku-4.5 (agent) vs payee-0.8b (ours): accuracy -5.5 pts, 95% CI [-8.8, -2.3], 15 newly right / 48 newly wrong, McNemar p=3.8e-05; items better / worse 13 / 33, sign test p=0.0045
- claude-sonnet-5 (agent) vs payee-0.8b (ours): accuracy -1.0 pts, 95% CI [-4.2, +1.8], 31 newly right / 37 newly wrong, McNemar p=0.54; items better / worse 24 / 20, sign test p=0.65
- claude-opus-5.5 (agent) vs payee-0.8b (ours): accuracy +3.5 pts, 95% CI [+1.0, +5.8], 36 newly right / 15 newly wrong, McNemar p=0.0046; items better / worse 32 / 10, sign test p=0.00094
- claude-fable-5.1 (agent) vs payee-0.8b (ours): accuracy +3.2 pts, 95% CI [+0.7, +5.5], 33 newly right / 14 newly wrong, McNemar p=0.0079; items better / worse 29 / 9, sign test p=0.0017
- llama-3.2-3b-payee (ours) vs payee-0.8b (ours): accuracy -3.7 pts, 95% CI [-6.7, -0.7], 28 newly right / 50 newly wrong, McNemar p=0.017; items better / worse 22 / 44, sign test p=0.0092
- gemma-4-e2b-payee (ours) vs payee-0.8b (ours): accuracy -2.0 pts, 95% CI [-5.3, +1.2], 33 newly right / 45 newly wrong, McNemar p=0.21; items better / worse 28 / 33, sign test p=0.61
- llama-3.3-70b (worker) vs payee-4b (ours, 1 epoch): accuracy -12.3 pts, 95% CI [-16.0, -8.8], 11 newly right / 85 newly wrong, McNemar p=2.5e-15; items better / worse 8 / 60, sign test p=5.7e-11
- claude-haiku-4.5 (agent) vs payee-4b (ours, 1 epoch): accuracy -7.5 pts, 95% CI [-10.8, -4.5], 11 newly right / 56 newly wrong, McNemar p=2.1e-08; items better / worse 9 / 40, sign test p=9.3e-06
- claude-sonnet-5 (agent) vs payee-4b (ours, 1 epoch): accuracy -3.0 pts, 95% CI [-6.5, +0.2], 28 newly right / 46 newly wrong, McNemar p=0.047; items better / worse 20 / 24, sign test p=0.65
- claude-opus-5.5 (agent) vs payee-4b (ours, 1 epoch): accuracy +1.5 pts, 95% CI [-1.3, +4.2], 33 newly right / 24 newly wrong, McNemar p=0.29; items better / worse 30 / 17, sign test p=0.079
- claude-fable-5.1 (agent) vs payee-4b (ours, 1 epoch): accuracy +1.2 pts, 95% CI [-1.7, +3.8], 30 newly right / 23 newly wrong, McNemar p=0.41; items better / worse 27 / 16, sign test p=0.13
- llama-3.2-3b-payee (ours) vs payee-4b (ours, 1 epoch): accuracy -5.7 pts, 95% CI [-8.5, -2.8], 22 newly right / 56 newly wrong, McNemar p=0.00015; items better / worse 18 / 48, sign test p=0.00029
- gemma-4-e2b-payee (ours) vs payee-4b (ours, 1 epoch): accuracy -4.0 pts, 95% CI [-7.0, -1.2], 22 newly right / 46 newly wrong, McNemar p=0.0049; items better / worse 17 / 29, sign test p=0.1
- claude-haiku-4.5 (agent) vs llama-3.3-70b (worker): accuracy +4.8 pts, 95% CI [+2.0, +7.7], 45 newly right / 16 newly wrong, McNemar p=0.00026; items better / worse 36 / 10, sign test p=0.00016
- claude-sonnet-5 (agent) vs llama-3.3-70b (worker): accuracy +9.3 pts, 95% CI [+6.2, +12.7], 71 newly right / 15 newly wrong, McNemar p=7.1e-10; items better / worse 50 / 5, sign test p=2.1e-10
- claude-opus-5.5 (agent) vs llama-3.3-70b (worker): accuracy +13.8 pts, 95% CI [+10.7, +17.2], 89 newly right / 6 newly wrong, McNemar p=4.7e-20; items better / worse 69 / 4, sign test p=2.4e-16
- claude-fable-5.1 (agent) vs llama-3.3-70b (worker): accuracy +13.5 pts, 95% CI [+10.3, +16.8], 89 newly right / 8 newly wrong, McNemar p=2e-18; items better / worse 69 / 6, sign test p=1.2e-14
- llama-3.2-3b-payee (ours) vs llama-3.3-70b (worker): accuracy +6.7 pts, 95% CI [+2.5, +11.0], 78 newly right / 38 newly wrong, McNemar p=0.00026; items better / worse 50 / 28, sign test p=0.017
- gemma-4-e2b-payee (ours) vs llama-3.3-70b (worker): accuracy +8.3 pts, 95% CI [+3.7, +13.0], 96 newly right / 46 newly wrong, McNemar p=3.3e-05; items better / worse 56 / 20, sign test p=4.4e-05
- claude-sonnet-5 (agent) vs claude-haiku-4.5 (agent): accuracy +4.5 pts, 95% CI [+1.2, +8.0], 54 newly right / 27 newly wrong, McNemar p=0.0036; items better / worse 36 / 14, sign test p=0.0026
- claude-opus-5.5 (agent) vs claude-haiku-4.5 (agent): accuracy +9.0 pts, 95% CI [+5.8, +12.3], 66 newly right / 12 newly wrong, McNemar p=3.5e-10; items better / worse 46 / 9, sign test p=4.3e-07
- claude-fable-5.1 (agent) vs claude-haiku-4.5 (agent): accuracy +8.7 pts, 95% CI [+5.5, +12.0], 64 newly right / 12 newly wrong, McNemar p=1e-09; items better / worse 44 / 9, sign test p=1.2e-06
- llama-3.2-3b-payee (ours) vs claude-haiku-4.5 (agent): accuracy +1.8 pts, 95% CI [-2.0, +5.8], 61 newly right / 50 newly wrong, McNemar p=0.34; items better / worse 38 / 39, sign test p=1
- gemma-4-e2b-payee (ours) vs claude-haiku-4.5 (agent): accuracy +3.5 pts, 95% CI [-0.8, +7.7], 68 newly right / 47 newly wrong, McNemar p=0.062; items better / worse 43 / 27, sign test p=0.072
- claude-opus-5.5 (agent) vs claude-sonnet-5 (agent): accuracy +4.5 pts, 95% CI [+2.8, +6.2], 28 newly right / 1 newly wrong, McNemar p=1.1e-07; items better / worse 27 / 1, sign test p=2.2e-07
- claude-fable-5.1 (agent) vs claude-sonnet-5 (agent): accuracy +4.2 pts, 95% CI [+2.3, +6.0], 29 newly right / 4 newly wrong, McNemar p=1.1e-05; items better / worse 28 / 4, sign test p=1.9e-05
- llama-3.2-3b-payee (ours) vs claude-sonnet-5 (agent): accuracy -2.7 pts, 95% CI [-6.7, +1.5], 44 newly right / 60 newly wrong, McNemar p=0.14; items better / worse 29 / 55, sign test p=0.006
- gemma-4-e2b-payee (ours) vs claude-sonnet-5 (agent): accuracy -1.0 pts, 95% CI [-5.2, +3.2], 48 newly right / 54 newly wrong, McNemar p=0.62; items better / worse 27 / 36, sign test p=0.31
- claude-fable-5.1 (agent) vs claude-opus-5.5 (agent): accuracy -0.3 pts, 95% CI [-1.0, +0.3], 1 newly right / 3 newly wrong, McNemar p=0.62; items better / worse 1 / 3, sign test p=0.62
- llama-3.2-3b-payee (ours) vs claude-opus-5.5 (agent): accuracy -7.2 pts, 95% CI [-10.3, -3.8], 21 newly right / 64 newly wrong, McNemar p=3.3e-06; items better / worse 14 / 58, sign test p=1.6e-07
- gemma-4-e2b-payee (ours) vs claude-opus-5.5 (agent): accuracy -5.5 pts, 95% CI [-9.0, -2.0], 25 newly right / 58 newly wrong, McNemar p=0.00038; items better / worse 18 / 45, sign test p=0.0009
- llama-3.2-3b-payee (ours) vs claude-fable-5.1 (agent): accuracy -6.8 pts, 95% CI [-9.8, -3.5], 21 newly right / 62 newly wrong, McNemar p=7.5e-06; items better / worse 14 / 56, sign test p=4.3e-07
- gemma-4-e2b-payee (ours) vs claude-fable-5.1 (agent): accuracy -5.2 pts, 95% CI [-8.7, -1.8], 24 newly right / 55 newly wrong, McNemar p=0.00064; items better / worse 18 / 43, sign test p=0.0019
- gemma-4-e2b-payee (ours) vs llama-3.2-3b-payee (ours): accuracy +1.7 pts, 95% CI [-1.5, +4.8], 56 newly right / 46 newly wrong, McNemar p=0.37; items better / worse 37 / 26, sign test p=0.21
- Jev at list price ($0.042/M input tokens) would cost about $0.0206 per 1k items (estimated from Kev's token counts; Jev's tokenizer may differ).

## Accuracy by family and language (mean over the 4 questions)

| group | n | kev-0.8b (base) | kev-0.8b (base, val-fitted T) | kev-4b (base) | payee-0.8b (ours) | payee-4b (ours, 1 epoch) | llama-3.3-70b (worker) | claude-haiku-4.5 (agent) | claude-sonnet-5 (agent) | claude-opus-5.5 (agent) | claude-fable-5.1 (agent) | llama-3.2-3b-payee (ours) | gemma-4-e2b-payee (ours) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bec_polite | 12 | 0.750 | 0.750 | 0.750 | 0.896 | 0.875 | 0.812 | 0.833 | 0.979 | 1.000 | 0.938 | 0.938 | 0.854 |
| bec_urgent | 9 | 0.750 | 0.750 | 0.722 | 1.000 | 0.972 | 0.806 | 0.917 | 1.000 | 1.000 | 1.000 | 0.917 | 0.861 |
| change_legit | 12 | 0.938 | 0.938 | 0.750 | 0.958 | 0.958 | 0.771 | 0.917 | 1.000 | 1.000 | 1.000 | 0.750 | 0.854 |
| credit_note | 12 | 0.729 | 0.729 | 1.000 | 0.979 | 0.958 | 0.958 | 0.938 | 1.000 | 1.000 | 1.000 | 0.833 | 1.000 |
| exec_legit | 7 | 0.607 | 0.607 | 0.464 | 0.857 | 1.000 | 0.393 | 0.643 | 0.250 | 0.536 | 0.536 | 1.000 | 1.000 |
| fake_exec | 12 | 0.604 | 0.604 | 0.562 | 0.938 | 0.958 | 0.833 | 0.875 | 0.875 | 1.000 | 1.000 | 1.000 | 1.000 |
| injection_bypass | 3 | 0.667 | 0.667 | 0.750 | 0.917 | 0.750 | 0.583 | 0.667 | 0.750 | 1.000 | 1.000 | 0.917 | 0.833 |
| injection_redirect | 6 | 0.375 | 0.375 | 0.625 | 0.875 | 0.833 | 0.292 | 0.333 | 0.958 | 0.958 | 0.958 | 0.833 | 0.958 |
| invoice_routine | 19 | 0.961 | 0.961 | 0.987 | 0.987 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.921 | 0.789 |
| invoice_swap | 7 | 0.536 | 0.536 | 0.571 | 0.679 | 0.750 | 0.714 | 0.643 | 0.679 | 0.929 | 0.929 | 0.857 | 0.786 |
| notice | 18 | 0.778 | 0.778 | 0.986 | 0.986 | 1.000 | 0.944 | 0.986 | 1.000 | 1.000 | 1.000 | 0.847 | 0.944 |
| refund_scam | 3 | 0.500 | 0.500 | 0.917 | 0.917 | 1.000 | 0.667 | 0.750 | 0.917 | 0.917 | 0.917 | 0.833 | 1.000 |
| reminder_gentle | 6 | 0.958 | 0.958 | 1.000 | 0.792 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 0.792 | 0.833 |
| reminder_overdue | 7 | 0.679 | 0.679 | 0.750 | 0.786 | 1.000 | 0.714 | 0.750 | 0.750 | 0.750 | 0.786 | 0.750 | 0.964 |
| x402_ok | 7 | 0.786 | 0.786 | 0.750 | 0.964 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 |
| x402_overcharge | 3 | 0.917 | 0.917 | 0.750 | 0.833 | 0.750 | 0.750 | 0.750 | 0.750 | 1.000 | 1.000 | 0.750 | 0.750 |
| x402_swap | 7 | 0.607 | 0.607 | 0.679 | 0.857 | 0.750 | 0.714 | 0.857 | 0.893 | 0.857 | 0.857 | 0.929 | 0.821 |
| en | 41 | 0.726 | 0.726 | 0.793 | 0.915 | 0.945 | 0.756 | 0.848 | 0.884 | 0.933 | 0.939 | 0.890 | 0.915 |
| ja | 109 | 0.755 | 0.755 | 0.796 | 0.920 | 0.936 | 0.837 | 0.869 | 0.917 | 0.961 | 0.954 | 0.878 | 0.892 |
