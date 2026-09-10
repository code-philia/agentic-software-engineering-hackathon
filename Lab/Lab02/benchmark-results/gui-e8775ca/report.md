# Lab02 GUI Direct + TDD benchmark

Date: 2026-09-11  
Frozen commit: `e8775ca`  
Sampling: `temperature=0`, non-thinking provider mode  
Execution: isolated Git worktree per attempt

## Success definition

An attempt is successful only when the generated train suite is GREEN on the contract-correct reference, the repaired implementation is GREEN on the frozen train suite, the run outcome is `GREEN`, and hidden validation improves over Direct. Failed attempts remain in the attempt count and success-rate denominator. Time, token, and validation averages use successful attempts only.

Test count and source size are prompt guidance only. There is no external count limit, trimming, quarantine, or partial-suite acceptance. The reference suite must be fully GREEN. Successful runs in this batch included generated suites of 11–39 tests.

## Results

| Model | Attempts | Success | Rate | Ref GREEN | TDD GREEN | Avg model time (s) | Avg input tokens | Avg output tokens | Avg total tokens | Avg Direct | Avg TDD | Avg improvement |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| qwen3.8-max | 5 | 4/5 | 80% | 5/5 | 4/5 | 219.0 | 126,876 | 16,699 | 143,575 | 8.3/36 | 26.0/36 | +17.8 |
| qwen3.6-plus | 5 | 3/5 | 60% | 5/5 | 3/5 | 409.1 | 125,956 | 22,360 | 148,316 | 8.3/36 | 33.0/36 | +24.7 |
| glm-5.3 | 3 | 1/3 | 33% | 2/3 | 1/3 | 308.7 | 35,052 | 12,229 | 47,281 | 15.0/36 | 35.0/36 | +20.0 |
| minimax-m3 | 3 | 1/3 | 33% | 1/3 | 1/3 | 256.8 | 193,021 | 34,501 | 227,522 | 15.0/36 | 35.0/36 | +20.0 |
| qwen3.7-max | 3 | 1/3 | 33% | 3/3 | 1/3 | 141.9 | 30,653 | 9,005 | 39,658 | 7.0/36 | 25.0/36 | +18.0 |
| qwen3.7-plus | 3 | 0/3 | 0% | 2/3 | 0/3 | — | — | — | — | — | — | — |
| deepseek-v4-flash | 1 | 0/1 | 0% | 0/1 | 0/1 | — | — | — | — | — | — | — |
| deepseek-v4-pro | 1 | 0/1 | 0% | 1/1 | 0/1 | — | — | — | — | — | — | — |
| glm-5.2 | 1 | 0/1 | 0% | 0/1 | 0/1 | — | — | — | — | — | — | — |
| kimi-k3 | 1 | 0/1 | 0% | 0/1 | 0/1 | — | — | — | — | — | — | — |
| qwen3.6-flash | 1 | 0/1 | 0% | 0/1 | 0/1 | — | — | — | — | — | — | — |

## Classroom recommendation

1. Use `qwen3.8-max` for the main live Direct + TDD demonstration. It completed the intended flow in 4/5 frozen attempts and is the only model above 60% success.
2. Use `qwen3.6-plus` as the second live candidate if a longer run is acceptable. It completed 3/5 attempts and its successful TDD implementations averaged 33/36 hidden validations, but successful model time averaged about 6.8 minutes.
3. Keep the successful `glm-5.3`, `minimax-m3`, and `qwen3.7-max` runs for the PPT comparison rather than relying on them live; each completed only 1/3 attempts.

Each raw `result.json` is stored under `results/<model>/<run-id>.json`. Failed-run averages are intentionally blank when a model has no successful attempt; its raw time, token usage, and failure reason remain available in the individual result.
