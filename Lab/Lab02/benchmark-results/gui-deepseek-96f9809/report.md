# DeepSeek GUI policy smoke benchmark — `96f9809`

This targeted run checks the revised DeepSeek policy: `temperature=0.2`, low reasoning effort, provider thinking enabled, 16,384 output-token budgets for all artifact stages, and up to 12,000 characters of reference failure feedback. It is separate from the frozen 11-model baseline and is not an average.

| Model | Outcome | Reference | Initial train | Final train | Test repairs | Implementation repairs | Validation | Successful-stage model time | Tokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| deepseek-v4-flash | GREEN | 11/11 | 3/11 | 11/11 | 0 | 2 | 20→32/36 | 397.1s | 78,710 |
| deepseek-v4-pro | RUN_ERROR | 10/10 | 2/10 | — | 0 | 0 | Direct 26/36 | 219.1s | 22,510 returned |

`deepseek-v4-flash` completed the intended flow with four returned model requests. Its 78,710 tokens comprise 25,497 input and 53,213 output tokens.

`deepseek-v4-pro` generated a reference-GREEN suite on its first attempt, and its test-generation response used 14,091 output tokens—direct evidence that the former 8,192 test-generation cap would have been too small for this completion. Its first implementation-repair request and one transport retry each timed out after roughly 300 seconds. The table reports only the two successful stages because the timed-out provider requests returned no usage. The failed repair added about 602.9 seconds of unbilled/unknown-usage waiting, for roughly 822.0 seconds across all model-stage waits.

Conclusion: the revised policy is accepted by both provider routes, and Flash now completes successfully. Pro's observed blocker is provider timeout stability in the repair stage, not train-suite quality: its generated suite was 10/10 on the reference implementation and its Direct implementation passed 26/36 hidden checks.

The next code commit (`379880f`) additionally archives the complete repair prompt and failed-stage duration when a provider timeout has no agent state. Tokens for such a request remain unavailable rather than being reported as zero usage.
