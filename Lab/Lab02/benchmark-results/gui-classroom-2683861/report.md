# GUI classroom candidate — `2683861`

This report freezes the three final `qwen3.8-max` repetitions used to select the live classroom model. It is intentionally separate from `gui-e8775ca`: the latter is the 11-model comparison baseline, while this report measures the final prompt, helper, and bounded repair-loop candidate.

Success requires all of the following: the reference train suite is GREEN, the final TDD train suite is GREEN, and hidden validation improves from Direct to TDD. Hidden validation does not need to reach 36/36. Failed attempts remain in the success-rate denominator; time and token averages use successful attempts only.

| Model | Attempts | Successful | Success rate | Avg model time | Avg requests | Avg input | Avg output | Avg total | Avg Direct | Avg TDD | Avg gain |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| qwen3.8-max | 3 | 3 | 100% | 120.0s | 3.0 | 19,421 | 9,084 | 28,505 | 8.3/36 | 30.3/36 | +22.0 |

## Individual runs

| Run | Reference | Initial train | Final train | Test repairs | Implementation repairs | Validation | Model time | Tokens |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `20260910T190032Z-gui-a84976c8` | 41/41 | 16/41 | 41/41 | 0 | 1 | 8→32/36 | 120.2s | 28,508 |
| `20260910T190041Z-gui-6c63441d` | 39/39 | 11/39 | 39/39 | 0 | 1 | 8→25/36 | 116.4s | 28,423 |
| `20260910T190047Z-gui-82ea46b4` | 40/40 | 14/40 | 40/40 | 0 | 1 | 9→34/36 | 123.4s | 28,585 |

All three runs generated a fully executable reference-GREEN suite on the first test-generation call, established RED on the unchanged Direct implementation, and reached train GREEN after one implementation repair call. The exact inputs, outputs, events, browser reports, and complete `result.json` files remain in their isolated worktree run directories; the compact committed record is `summary.json`.

## Classroom recommendation

Use `qwen3.8-max` for the primary live demonstration on commit `2683861`. Keep `qwen3.6-plus` as the fallback based on the frozen multi-model baseline. Preserve `temperature=0`; the stability gain came from executable helper semantics and bounded fresh repair rounds, not sampling randomness.
