# GUI visual-alignment stability gate — `eeaf33c`

This report freezes the first repeated-model gate after aligning the public GUI brief, generated train-test guidance, and the teacher reference presentation. Success requires a reference-GREEN train suite, a final train-GREEN TDD implementation, and improved hidden validation. Failed attempts remain in the success-rate denominator; time and token averages use successful attempts only.

| Model | Attempts | Successful | Success rate | Avg model time | Avg requests | Avg input | Avg output | Avg total | Avg Direct | Avg TDD | Avg gain | Visual |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen3.8-max | 3 | 3 | 100% | 190.6s | 4.7 | 32,655 | 14,261 | 46,915 | 10.7/36 | 31.7/36 | +21.0 | 6/8 → 8/8 |
| qwen3.6-plus | 3 | 1 | 33% | 379.2s | 6.0 | 40,314 | 21,370 | 61,684 | 10.0/36 | 35.0/36 | +25.0 | 6/8 → 8/8 |

## Individual runs

| Model | Run | Outcome | Reference | Initial | Final | Test repairs | Implementation repairs | Validation | Model time | Tokens |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen3.8-max | `20260911T003307Z-gui-c827ccd9` | GREEN | 34/34 | 2/34 | 34/34 | 1 | 2 | 11→35/36 | 211.6s | 53,947 |
| qwen3.8-max | `20260911T003317Z-gui-1600489e` | GREEN | 12/12 | 4/12 | 12/12 | 2 | 2 | 10→27/36 | 238.5s | 59,180 |
| qwen3.8-max | `20260911T003331Z-gui-30c9fbd7` | GREEN | 35/35 | 16/35 | 35/35 | 0 | 1 | 11→33/36 | 121.6s | 27,619 |
| qwen3.6-plus | `20260911T002435Z-gui-9b168a29` | GREEN | 8/8 | 2/8 | 8/8 | 2 | 2 | 10→35/36 | 379.2s | 61,684 |
| qwen3.6-plus | `20260911T003326Z-gui-bc6c41e4` | INVALID_TRAIN_SUITE | 11/13 | — | 11/13 | 3 | 0 | 10→—/36 | 272.5s | 43,127 |
| qwen3.6-plus | `20260911T003351Z-gui-2103fb6c` | INVALID_TRAIN_SUITE | 8/9 | — | 8/9 | 3 | 0 | 9→—/36 | 237.3s | 39,886 |

The two failed `qwen3.6-plus` suites retained semantically invalid presentation or email assertions after all three rewrites: one required the form element itself rather than its surrounding panel to be white and rejected a public-valid short top-level domain; the other used an RGB pattern that did not recognize the reference orange. The earlier undefined-password and cross-test locator-scope defects did not recur after the `eeaf33c` guidance change.

An additional `deepseek-v4-pro` diagnostic on the immediately preceding visual-alignment commit completed 10→36/36 with visual 6/8→8/8, but required 542.2 seconds and 72,642 tokens. It is useful for recorded comparison, not as the primary live model.

## Classroom recommendation

Use `qwen3.8-max` as the primary live GUI model on `eeaf33c`: it completed 3/3 runs, visibly improved the shared baseline, and reached visual 8/8 every time. Do not use `qwen3.6-plus` as the live fallback yet; its successful result was strong, but only 1/3 attempts reached the TDD implementation loop. Keep `deepseek-v4-pro` as an offline comparison result because its quality is high but latency and token use are much larger.
