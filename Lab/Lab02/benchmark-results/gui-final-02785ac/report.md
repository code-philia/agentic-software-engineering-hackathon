# Lab02 GUI Direct + TDD final benchmark

Date: 2026-09-11  
Frozen commit: `02785ac3aa982e625a047ac0b5aa3163dc212e02`  
Models: the 11-model classroom list; dated DeepSeek aliases are excluded  
Sampling: three independent attempts per model in isolated Git worktrees

## Success and averaging rules

An attempt counts as successful only when the generated train suite is GREEN on the contract-correct reference, the final implementation is GREEN on the frozen train suite, the run outcome is `GREEN`, and hidden validation improves over Direct.

Every failed attempt remains in the completion-rate denominator. Average time, token usage, and validation scores are calculated from successful attempts only, matching the classroom comparison rule. The last two columns expose the total model-call cost of all three attempts, including failures. “Time” means summed model-request time recorded by the runner, not parallel batch wall-clock time or Playwright execution time.

## Final results

| Model | Success | Rate | Ref GREEN | TDD GREEN | Avg model time, success (s) | Avg input | Avg output | Avg total tokens | Avg Direct | Avg TDD | Avg improvement | All-attempt time (s) | All-attempt tokens |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| deepseek-v4-flash | 3/3 | 100% | 3/3 | 3/3 | 374.2 | 24,954 | 47,915 | 72,868 | 13.0/36 | 36.0/36 | +23.0 | 1,122.5 | 218,605 |
| deepseek-v4-pro | 3/3 | 100% | 3/3 | 3/3 | 826.1 | 31,354 | 50,551 | 81,905 | 26.3/36 | 35.0/36 | +8.7 | 2,478.4 | 245,715 |
| glm-5.3 | 2/3 | 67% | 2/3 | 2/3 | 365.7 | 32,165 | 16,816 | 48,981 | 15.5/36 | 33.5/36 | +18.0 | 1,629.7 | 143,143 |
| qwen3.7-max | 2/3 | 67% | 3/3 | 2/3 | 236.3 | 31,434 | 14,649 | 46,083 | 9.5/36 | 34.5/36 | +25.0 | 867.1 | 175,694 |
| glm-5.2 | 1/3 | 33% | 3/3 | 1/3 | 373.5 | 35,972 | 19,733 | 55,705 | 27.0/36 | 36.0/36 | +9.0 | 1,654.1 | 268,228 |
| minimax-m3 | 1/3 | 33% | 1/3 | 1/3 | 370.1 | 63,994 | 31,889 | 95,883 | 21.0/36 | 36.0/36 | +15.0 | 769.2 | 197,821 |
| qwen3.6-flash | 1/3 | 33% | 1/3 | 1/3 | 222.1 | 71,914 | 34,918 | 106,832 | 10.0/36 | 11.0/36 | +1.0 | 479.1 | 229,956 |
| qwen3.6-plus | 1/3 | 33% | 1/3 | 1/3 | 434.4 | 42,931 | 24,447 | 67,378 | 10.0/36 | 36.0/36 | +26.0 | 986.0 | 155,731 |
| qwen3.8-max | 1/3 | 33% | 3/3 | 1/3 | 129.9 | 15,504 | 9,226 | 24,730 | 9.0/36 | 26.0/36 | +17.0 | 1,206.3 | 333,454 |
| kimi-k3 | 0/3 | 0% | 0/3 | 0/3 | — | — | — | — | — | — | — | 2,233.1 | 91,861 |
| qwen3.7-plus | 0/3 | 0% | 1/3 | 0/3 | — | — | — | — | — | — | — | 1,343.7 | 415,693 |

Across all models, 15 of 33 attempts completed successfully (45.5%). The 33 attempts consumed 14,769.2 seconds of recorded model-call time, 198 model requests, 1,548,626 input tokens, 927,275 output tokens, and 2,475,901 total tokens.

## Attempt outcomes

| Model | Attempt 1 | Attempt 2 | Attempt 3 |
| --- | --- | --- | --- |
| deepseek-v4-flash | GREEN | GREEN | GREEN |
| deepseek-v4-pro | GREEN | GREEN | GREEN |
| glm-5.3 | INVALID_TRAIN_SUITE | GREEN | GREEN |
| qwen3.7-max | GREEN | GREEN | LIMIT_REACHED |
| glm-5.2 | LIMIT_REACHED | GREEN | LIMIT_REACHED |
| minimax-m3 | INVALID_TRAIN_SUITE | INVALID_TRAIN_SUITE | GREEN |
| qwen3.6-flash | INVALID_TRAIN_SUITE | INVALID_TRAIN_SUITE | GREEN |
| qwen3.6-plus | INVALID_TRAIN_SUITE | INVALID_TRAIN_SUITE | GREEN |
| qwen3.8-max | GREEN | LIMIT_REACHED | LIMIT_REACHED |
| kimi-k3 | RUN_ERROR | RUN_ERROR | GENERATION_ERROR |
| qwen3.7-plus | GENERATION_ERROR | LIMIT_REACHED | INVALID_TRAIN_SUITE |

`INVALID_TRAIN_SUITE` means the generated tests could not be made fully GREEN on the reference within the test-repair budget. `LIMIT_REACHED` means the reference suite was valid, but implementation repair exhausted its budget before the generated suite became GREEN. `RUN_ERROR` and `GENERATION_ERROR` preserve provider timeout or generation failures.

## Classroom recommendation

1. Use `deepseek-v4-flash` for the main live demonstration. It is the best current combination of observed completion (3/3), final validation (36/36), and successful-run time (about 6.2 minutes).
2. Keep `qwen3.7-max` as the faster live fallback. It completed 2/3, averaged about 3.9 minutes on successful runs, and improved from 9.5/36 to 34.5/36. Its risk is large 39–41-test train suites; one attempt stopped at the implementation-repair limit.
3. `deepseek-v4-pro` is the strongest stability fallback (3/3), but not a good default live choice: its mean was 13.8 minutes and one successful run spent about 26 minutes in model calls after timeout retries.
4. Do not use `qwen3.8-max` as the primary model under this frozen configuration. Although its successful run was very fast, the other two attempts generated 39-test suites and exhausted implementation repair, producing only 1/3 completion.

The copied result JSON files are under `results/<model>/<run-id>.json`. They retain stage-level request counts, timings, token usage, validations, train-suite results, repair counts, and failure details for every attempt. For all 18 failed attempts, the complete model prompts, raw provider responses, extracted responses, contracts, and intermediate generated files are additionally preserved under `failed-raw/<model>/<run-id>/raw/` for diagnosis.
