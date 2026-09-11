# GUI second-live-model comparison — `de97b4a`

This report compares `qwen3.7-max` and `glm-5.3` as candidates to back up the primary live model, `qwen3.8-max`. Success requires a reference-GREEN train suite, a final train-GREEN TDD implementation, and improved hidden validation. Failed attempts remain in the success-rate denominator; averages use successful attempts only.

| Model | Attempts | Successful | Success rate | Avg model time | Avg requests | Avg input | Avg output | Avg total | Avg Direct | Avg TDD | Avg gain | Visual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| glm-5.3 | 3 | 3 | 100% | 380.3s | 5.3 | 34,981 | 16,268 | 51,249 | 21.7/36 | 35.3/36 | +13.7 | 7.7/8 → 8/8 |
| qwen3.7-max | 3 | 2 | 66.7% | 173.0s | 3.5 | 23,097 | 10,800 | 33,897 | 8.5/36 | 31.5/36 | +23.0 | 6/8 → 8/8 |

## Individual runs

| Model | Run | Outcome | Reference | Initial | Final | Test repairs | Implementation repairs | Validation | Model time | Tokens |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| glm-5.3 | `20260911T010159Z-gui-cc6f1f03` | GREEN | 12/12 | 1/12 | 12/12 | 2 | 2 | 13→36/36 | 458.4s | 62,745 |
| glm-5.3 | `20260911T012843Z-gui-1a986fde` | GREEN | 10/10 | 4/10 | 10/10 | 1 | 1 | 27→36/36 | 303.5s | 35,101 |
| glm-5.3 | `20260911T012902Z-gui-ef6d053c` | GREEN | 9/9 | 1/9 | 9/9 | 2 | 2 | 25→34/36 | 379.0s | 55,902 |
| qwen3.7-max | `20260911T010217Z-gui-578feca4` | GREEN | 36/36 | 15/36 | 36/36 | 1 | 1 | 8→36/36 | 197.1s | 40,579 |
| qwen3.7-max | `20260911T011238Z-gui-96de088c` | GREEN | 33/33 | 11/33 | 33/33 | 0 | 1 | 9→27/36 | 148.8s | 27,215 |
| qwen3.7-max | `20260911T011249Z-gui-074dbcc9` | LIMIT_REACHED | 43/43 | timeout | 42/43 | 1 | 2 | 8→33/36 | 739.7s | 181,869 |

`qwen3.7-max` is faster and produces a larger Direct-to-TDD contrast when it completes, but its third repetition hit the 90-second initial-train timeout and ended one train check short after a long repair tail. `glm-5.3` completed all three repetitions and consistently reached 34–36 independent validation checks, though its Direct implementation was much stronger in two runs and therefore produced a smaller teaching contrast.

## Classroom recommendation

- Primary live model: `qwen3.8-max` (3/3 in the visual-alignment stability gate, about 190.6 seconds average model time).
- Second live model: `glm-5.3` (3/3 here, about 380.3 seconds average model time).
- Saved fast comparison only: a successful `qwen3.7-max` run. Do not rely on it live because the observed completion rate is 2/3 and its failed long tail exceeded 12 minutes.
- Saved high-quality comparison: `deepseek-v4-flash` reached 36/36 but required about 12.8 minutes in its measured run.
