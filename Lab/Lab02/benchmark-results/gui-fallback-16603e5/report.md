# GUI fallback comparison — `16603e5`

This comparison follows the `eeaf33c` stability gate. The prompt policy now states that the exercise does not invent a minimum final-domain-label length, that a white registration panel may surround a transparent form, and that broad colors should be classified from numeric channel relationships rather than serialized-RGB regular expressions.

| Model | Outcome | Reference | Initial train | Final train | Test repairs | Implementation repairs | Validation | Visual | Model time | Requests | Tokens |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen3.6-plus | GENERATION_ERROR | 5/7 before terminal repair | — | — | 2 completed; third failed | 0 | 9→—/36 | 6→—/8 | 622.8s | 10 | 164,869 |
| deepseek-v4-flash | GREEN | 12/12 | 3/12 | 12/12 | 0 | 3 | 9→36/36 | 6→8/8 | 766.7s | 5 | 135,264 |

The `qwen3.6-plus` run correctly stopped inventing a one-letter-TLD rejection and correctly looked through form ancestors for the visible white panel. It nevertheless introduced another overly restrictive dark-blue threshold plus an invalid duplicate/rejected-attempt assertion. On the third train-test repair call it exhausted six internal model turns without producing an accepted replacement suite. The final failed stage alone consumed 129,580 tokens.

`deepseek-v4-flash` generated a reference-GREEN suite on its first attempt, established useful Red, reached train Green after three implementation repairs, and passed all 36 independent validation checks. Its limitation is classroom latency and output volume: implementation repair alone took 619.7 seconds and 109,444 tokens.

## Decision

- Keep `qwen3.8-max` as the primary live model based on its 3/3 stability gate.
- Stop treating `qwen3.6-plus` as a live fallback candidate.
- Keep the successful `deepseek-v4-flash` run for a saved demonstration and PPT comparison. Its quality is excellent, but a roughly 12.8-minute model runtime is too long for the live GUI segment.
- Evaluate a faster second live candidate separately rather than adding more special-case guidance for `qwen3.6-plus`.

The full local run artifacts are:

- `qwen3.6-plus`: `/tmp/lab02-compare-16603e5-q36/Lab/Lab02/runs/20260911T004515Z-gui-b38362a2`
- `deepseek-v4-flash`: `/tmp/lab02-compare-16603e5-deepseek-flash/Lab/Lab02/runs/20260911T004517Z-gui-a48f967b`
