# TDD Course Design Charter

This file is the source of truth for the course design. Follow it when creating prompts, runners, generated artifacts, validation suites, model benchmarks, or future teaching materials.

## Language

- Course README files and explanatory documentation may be written in Chinese.
- Task briefs, prompts shown to students, source-code comments, terminal or web UI copy, execution contracts, and generated artifacts must be written in English.
- Internal planning conversations do not have to be in English.

## Course Purpose

The course demonstrates test-driven development as a harness for LLM-based code generation.

More precisely, the exercise demonstrates test-driven repair of an LLM-generated baseline: executable tests create a Red-Green feedback loop that guides the model toward a better implementation. It does not claim to teach the complete discipline of classical greenfield, test-first TDD in one lesson.

The primary comparison is the same model starting from the exact same generated implementation:

1. The untouched implementation is the Direct result.
2. A copy is improved through model-generated executable train tests and a bounded TDD repair loop.

The intended classroom observation is that the TDD result performs materially better than the Direct result on a strict, model-blind validation suite. The test-authoring stage may receive code-owned scenario instructions that make the desired behavior concrete so the generated executable tests can expose omissions in the shared baseline. The broader hypothesis is that a cheap or relatively weak model with a TDD harness may approach the validation performance of a stronger model using direct generation.

Treat this as a hypothesis to test, not a guaranteed conclusion. Do not hard-code, manufacture, or selectively report results to make the hypothesis appear true.

## Teaching Scope and Constraints

- The core activity is a 50-minute, individual classroom exercise.
- Assume students have basic programming experience.
- Support both macOS and Windows.
- Students complete runtime, dependency, browser, endpoint, and credential configuration before class.
- Use Node.js 24 and npm as the common classroom environment.
- Optimize for clarity, observability, and repeatability in a short lesson.
- This is not a production software engineering exercise.
- Prefer transparent, minimal files and direct control flow.
- Do not introduce databases, containers, application frameworks, architectural layers, or abstractions unless the experiment requires them.
- Do not add a student-authored-test track. The core comparison contains only Direct and TDD.

## Core Experiment Matrix

Run the same Direct-versus-TDD comparison in two parallel scenarios:

| Scenario | Direct | TDD |
| --- | --- | --- |
| Registration API | Required | Required |
| Registration GUI | Required | Required |

The classroom comparison uses the same selected model throughout the run and the exact same generated implementation as the starting point of both arms. A stronger model's Direct result may be measured separately as an instructor-side reference, but it is not required as a live student activity.

At the start of one experiment, load one endpoint and credential configuration from the selected environment file, then select the environment default model or a supported `--model` override. Freeze and reuse that resolved configuration for Direct implementation generation, train-test generation, test repair, and TDD implementation repair. Do not switch models between stages of the same experiment.

## Information Layers

Keep these layers separate.

### 1. Public task brief

- Write a short, natural, student-readable description of the requested behavior.
- Give the same task brief to Direct generation and the TDD implementation-repair path.
- State business intent at a natural product level without enumerating detailed validation rules or examples.
- Do not fill the brief with filenames, runner parameters, process management, or other harness plumbing.

### 2. Execution contract

- Teacher-owned prompt scaffolding defines how generated code connects to the fixed harness.
- It may specify the target file, output format, public extension point, allowed dependencies, runtime restrictions, and fixed test helpers.
- Put necessary engineering constraints here rather than making the public task brief difficult to read.
- Fix every interface detail required for generated artifacts and tests to connect reliably to the harness, including filenames, request fields, routes, response families, environment variables, and stable browser seams.
- Keep detailed product validation policy out of implementation contracts unless it is required for harness interoperability.
- Do not constrain internal function names, component structure, DOM hierarchy, or other implementation details unless they are the documented public extension point.

### 3. Test-authoring instructions

- Code-owned scenario instructions may make validation, normalization, boundary, state, accessibility, persistence, safety, and presentation expectations concrete for the test-generation model.
- Inject these instructions only into train-test generation and train-test repair. Do not give them directly to Direct generation or TDD implementation repair.
- Keep these instructions in application code rather than a separately displayed course document.
- Do not print or summarize these instructions in the student-facing CLI. The generated executable tests themselves are the teaching surface through which the TDD path receives the behavior.
- Preserve the exact composed model prompts in instructor run artifacts for reproducibility and diagnosis.
- Instructions may describe policy and boundary families but must not contain validation source, exact validation examples, validation test names, pass counts, or validation feedback.

### 4. Hidden validation specification

- The instructor authors and freezes validation before comparing models.
- Never include validation source, inputs, expected values, failures, pass counts, or category feedback in a model context.
- Validation may exercise the detailed code-owned test-authoring policy with independent examples, including behavior not enumerated in the task brief.
- Validation tests only externally observable behavior.

## Scenario Contracts

### Registration API

- Use a minimal TypeScript implementation artifact named `register.ts`.
- The generated file exposes one documented default handler based on the standard `Request` and `Response` interfaces.
- A teacher-owned adapter handles HTTP server startup, ports, process lifecycle, and connection of `POST /api/register` to the generated handler.
- The public behavior covers username, email, optional date of birth, password, password confirmation, input validation, duplicate prevention, successful registration, and a non-empty session token.
- Terms acceptance is not part of the API task.
- Module-local in-memory state is sufficient. Do not require a database or file persistence.
- Use Vitest for executable train tests and validation.
- Exercise the generated implementation through its public HTTP behavior rather than importing private implementation details.
- The implementation and train-test execution contracts are `prompts/contracts/api-implementation.md` and `prompts/contracts/api-tests.md`.
- The test runner supplies the fresh server origin through `COURSE_API_BASE_URL`.

### Registration GUI

- Use a complete generated `index.html` with inline CSS and browser JavaScript.
- A teacher-owned static server handles hosting, ports, and process lifecycle.
- The public behavior covers username, email, password, password confirmation, terms acceptance, password visibility, form validation, clear errors, successful registration feedback, and duplicate registration.
- `localStorage` is sufficient for the simple persistence needed by the exercise. Do not require a generated backend or database.
- Give students a live teacher-owned standard UI implemented as HTML so they can compare it with Direct and TDD in the browser. Give the model only an English textual visual description; never include the standard page or its source in model context.
- Use Playwright for executable train tests and validation.
- Prefer accessible roles, labels, and visible text as test seams. Use a small stable test identifier only when an important state cannot be located naturally.
- Validate browser-observable behavior, accessibility, and a small number of stable visual properties. Do not use pixel-perfect screenshot comparison.
- The implementation and train-test execution contracts are `prompts/contracts/gui-implementation.md` and `prompts/contracts/gui-tests.md`.
- The test runner supplies the fresh page URL through `COURSE_GUI_BASE_URL`.

## Student Workflow

Expose one interactive command per scenario, provisionally:

```text
npm run demo:api
npm run demo:gui
```

Use `npm run rehearse:gui` for an instructor-only offline walkthrough. It substitutes fixed local artifacts for model calls while exercising the real GUI server, Playwright train-test runner, hidden validation, checkpoints, workspace layout, and run logging. Clearly label its output as a rehearsal; never present its fixed pass counts as model evidence.

Each command performs the complete Direct-versus-TDD experiment in six student-facing acts, numbered 0 through 5, with one teaching checkpoint at the end of each act:

0. Review the task and experiment shape before any model generation begins.
1. Generate the shared baseline.
2. Measure the Direct result.
3. Generate and verify executable train tests.
4. Establish Red and run the bounded TDD repair loop.
5. Compare the final Direct and TDD validation results.

Students press Enter to continue at each checkpoint rather than repeatedly invoking individual generation and repair commands. Provide a non-interactive mode for instructor benchmarking and automated verification.

Keep terminal output staged and concise. Save full prompts, raw responses, generated artifacts, tests, and machine-readable results for inspection without printing all of them during the lesson.

## Direct and TDD Flow

For each scenario:

1. Give the implementation model the task brief and implementation execution contract.
2. Generate one Direct implementation.
3. Make an exact copy as the TDD working implementation.
4. Run hidden validation against the untouched Direct artifact without returning any validation information to a model.
5. Show students only approved human-facing validation categories and passed/total check counts.
6. Ask the test-generation model to produce real executable Vitest or Playwright test source using the task brief, test execution contract, and code-owned scenario test-authoring instructions.
7. Run the generated train suite against a teacher-owned contract-correct reference implementation.
8. If that run is `TEST_ERROR` or Red, return the current suite plus the bounded reference feedback to the test model and let it rewrite the suite. Allow at most three accepted test rewrites, checking the complete suite against the reference after each rewrite.
9. `TEST_ERROR` feedback identifies an execution or contract problem. Red feedback identifies assertions that disagree with the public task. Never provide the reference source, Direct implementation, hidden validation, or validation feedback during either repair.
10. If the suite is still not Green against the reference after the test-rewrite budget is exhausted, stop the run as `INVALID_TRAIN_SUITE`.
11. Once the suite is Green against the reference, freeze it and run it against the TDD working copy to establish Red or Green.
12. If Red, give only the frozen train tests and their runner feedback to the implementation model.
13. Repeat implementation repair until all train tests are Green or three implementation-repair attempts have been used.
14. Run hidden validation once against the final TDD artifact.
15. Display the Direct and TDD validation results side by side.

Never use validation feedback inside this loop.

Use the following run-level outcomes in addition to test results:

- `GENERATION_ERROR`: a model response cannot be converted into the required implementation or test artifact.
- `INVALID_TRAIN_SUITE`: the train suite is still `TEST_ERROR` or Red against the teacher reference implementation after all three allowed test rewrites.
- `LIMIT_REACHED`: the executable train suite remains Red after all implementation-repair attempts.
- `RUN_ERROR`: a provider, timeout, cancellation, filesystem, runner, or other infrastructure failure prevents the experiment from reaching a defined experimental outcome.

An invalid train suite ends that experimental run. Do not replace it silently with instructor-authored tests. In non-interactive benchmarking, record the outcome and continue to the next run. In class, the instructor may continue with a clearly identified saved run.

## Train-Test Generation Rules

- The model generates executable test source, not merely prose or structured case data.
- The test generator receives the task brief, the fixed test execution contract, and code-owned scenario test-authoring instructions, including detailed product rules and the runner URL environment variable.
- It does not receive the current implementation.
- It does not receive validation material or feedback.
- Do not request an exact number of tests.
- The code-owned instructions may enumerate policy boundaries and behavior families, but they must not reproduce concrete validation cases.
- Ask the model to think carefully and thoroughly about whether inputs are valid, whether the user flow behaves correctly, and whether state is saved correctly.
- Require every generated test to make a meaningful assertion derived from the task, execution contract, or code-owned test-authoring instructions.

The generated suite may contain any number of tests the model considers appropriate, subject only to practical output and execution limits.

## Test Failure Classification

Distinguish a broken test from a useful Red:

- `TEST_ERROR`: the suite has a syntax, loading, collection, forbidden-access, or execution-contract error. The test model may receive the bounded infrastructure feedback and rewrite the suite within the shared three-rewrite budget.
- A suite that executes but fails against the teacher-owned contract-correct implementation contains at least one semantically invalid assertion. The test model may receive the bounded assertion feedback and rewrite the suite within the same budget. Do not send the suite to the implementation-repair agent unless it becomes Green against the reference.
- `RED`: the executable suite reaches the target and produces an assertion, locator, interaction, or expected-behavior failure. Freeze the tests and repair the implementation, not the tests.
- `GREEN`: all executable train tests pass. Stop the TDD loop.

Once the suite is Green on the reference and frozen, do not change it merely because it is Red on the TDD working implementation. During instructor benchmarking, review generated tests for semantic mistakes before choosing a classroom model.

If the generated train suite is already Green on the Direct implementation, report that result honestly. Do not secretly strengthen it with validation knowledge. Treat frequent initial Green results as evidence that a model or task configuration is unsuitable for the classroom demonstration.

The teacher reference implementation is only a preflight oracle for the public brief and execution contract. Keep one minimal single-file reference per scenario. Do not show it to students, include it in model context, use it as implementation output, or derive train tests from its internals. This preflight is not hidden validation and normally adds no model call.

## State Isolation and Repeatability

- Direct and TDD validation must begin from equivalent clean state.
- API runs use fresh application state and a fresh server process wherever process isolation is needed.
- GUI train tests and validation use fresh browser contexts and clear relevant origin storage, including `localStorage`.
- Generated train tests, Direct validation, TDD validation, and student preview state must not leak registered users or other mutable data into one another.
- Test ordering must not change the result. Any test that intentionally checks duplicates must create its own prerequisite state.
- Use deterministic inputs and fixed local behavior; do not depend on external email, DNS, clock-sensitive, or network services.

## Validation Design

Validation must be strict, broad, deterministic, human-authored, and frozen before model benchmarking. Strictness should come from semantic breadth, not from many near-duplicate cases.

Use data-driven checks and keep the number of independently reported checks reasonably balanced across categories. Student-facing validation and primary per-run results report only passed/total checks overall and per category; do not introduce points, weights, percentages, or a score abstraction there. Instructor-side aggregate analysis may derive unweighted pass rates and improvement rates across repeated runs when the underlying passed/total counts remain available and clearly primary.

### API validation categories

- Core registration behavior.
- Input validation.
- State and duplicate handling.
- Response contract and safety.

### GUI validation categories

- Structure and accessibility.
- Form validation.
- Interaction and state.
- Stable visual requirements.

Email validation should be demanding across high-consensus web-registration cases, including clearly valid and clearly malformed values. Do not claim to implement one universally authoritative email grammar, and avoid disputed RFC, quoted-local-part, SMTPUTF8, DNS, or MX-delivery semantics. Do not let a large email table dominate the reported checks.

After each validation run, students see category results followed by the human-readable names or descriptions of failed checks, grouped by category. Do not show concrete hidden inputs, expected values, assertion diffs, stack traces, raw runner output, or validation source. Use the same presentation after TDD for a side-by-side comparison. Human-facing results must never become model feedback.

The desired result is a runnable but behaviorally incomplete Direct artifact and a TDD artifact that passes all validation or improves substantially. Do not set a numerical improvement threshold until the framework and validation suites exist and have been exercised against real models.

## Model and Provider Evaluation

The repository may contain environment templates for multiple model endpoints. Every classroom endpoint must pass the course's Chat Completions and function-calling doctor checks before use. Students configure endpoint credentials before class and may select one of the code-owned supported models at the start of a run with `--model`. The resolved model remains fixed throughout that complete Direct-versus-TDD experiment.

After implementing the framework and freezing validation:

- Run each candidate repeatedly in both API and GUI scenarios.
- Compare the same model's Direct and TDD results from the same initial implementation.
- Record test validity, validation results, repair counts, model calls, token usage, latency, and estimated cost when available.
- Prefer a classroom model whose Direct result is runnable but predictably incomplete and whose generated train tests produce stable TDD improvement.
- Reject configurations that depend on one lucky run, routinely produce broken artifacts, or routinely generate semantically incorrect tests.
- Decide quantitative selection thresholds only after observing the empirical result distribution.
- Do not alter frozen validation to favor a candidate model.

## Classroom Timing

Assume setup is complete before class.

- 0-5 minutes: explain Direct, train tests, hidden validation, and the harness idea.
- 5-20 minutes: run and discuss the API experiment.
- 20-38 minutes: run and discuss the GUI experiment.
- 38-45 minutes: compare Direct and TDD validation, calls, latency, and cost.
- 45-50 minutes: summarize that the quality of the generated tests limits the quality of the harness.

Prepare saved run artifacts for network or provider failures. Clearly label saved results; never present them as a live run.

## Future Extension: Validation-Guided Coverage Growth

Do not implement this extension in the initial course.

If a later course teaches adding train tests after evaluation gaps, introduce three distinct suites:

1. Generated train tests used by the TDD loop.
2. A development evaluation suite whose category feedback may guide additional train-test generation.
3. A final holdout suite that remains untouched and is run only at the end.

Once results from a suite guide further changes, that suite is no longer a final blind validation suite.

## Minimal Safety Requirements

- Do not expose provider credentials to generated application or test subprocesses; pass a filtered environment.
- Model-generation calls return only target content and do not receive general shell or unrestricted file-reading tools.
- Test-generation and test-repair prompts explicitly prohibit inspecting implementations, reference artifacts, validation material, repository files, or run artifacts. Generated tests must derive behavior only from the public brief and execution contract. This is a teaching-level prompt boundary, not a security sandbox against deliberately hostile generated code.
- Treat generated code as untrusted local code and warn users not to run expanded experiments in an environment containing unrelated secrets.
- Do not add containers or a complex sandbox to the initial teaching implementation.

## Resolved Technical Stack and Presentation

### Console-first student experience

- Use the terminal as the primary classroom interface. Do not build a separate course web dashboard.
- The console presents facts needed at the current stage: the requirement, current phase, model-call status, generated train tests, test status, repair progress, validation category pass counts, durations, token usage, and artifact paths.
- The console may briefly explain the role and mechanics of the current act. It must not make subjective claims about model quality, infer causes from one run, declare that TDD is superior, or automatically turn observed results into teaching conclusions. The instructor owns interpretation.
- Use `@clack/prompts` for headings, status lines, spinners, and checkpoint interactions.
- Use `cli-table3` for compact Direct-versus-TDD result tables.
- Support terminals without color or animation and non-TTY output.

### Interaction modes and pause ownership

The external orchestrator owns the teaching pace even when an agent owns the repair decisions.

- Default classroom mode pauses only at the six major teaching checkpoints, one after each Act from 0 through 5.
- `--step-repairs` may additionally pause after agent implementation writes or train-test runs for instructor debugging and detailed demonstrations.
- `--no-interactive` performs no pauses and is required for instructor benchmarking and automated verification.
- The orchestrator runs the first train-test execution and displays initial Red before starting the repair agent.
- A local function tool may render and log its result, wait for a student checkpoint, and only then return that result to the agent. This preserves agent context across a pause.
- Do not attempt to pause an individual model HTTP request already in flight. Pause before an agent run, between completed agent runs, or inside local tools.

### GUI preview

- The course command starts the fixed local static server automatically.
- Print clickable localhost URLs for the Direct and TDD GUI artifacts.
- The implementation may use `open` to launch the system browser and must provide `--no-open`.
- Keep preview browser state separate from Playwright validation state. Playwright validation uses a fresh isolated browser context.
- Stop the local server cleanly when the course command exits.

### Diagnostic logging

- Treat the student-facing console as a presentation surface, not as the diagnostic log stream.
- Use Pino to write structured JSON Lines events to a per-run local log.
- Redact credentials, authorization headers, cookies, and other configured secret fields.
- Never log all of `process.env` or a raw configuration object containing secrets.
- Save the exact composed prompts, raw model responses, generated implementations, generated train tests, raw Vitest/Playwright output, and a machine-readable result summary as separate run artifacts. The run directory retains immutable Direct, initial TDD, final TDD, and frozen train-test snapshots even though `workspace/` is replaced by a later run.
- A model or agent run emits a start event and a completion or failure event. Record scenario, stage, selected environment file, model, effective inference policy, duration, request count, token usage when reported, retry decisions, and final status. Preserve raw responses so tool calls remain inspectable.
- When a provider omits usage, record that usage is unavailable; do not record missing usage as zero.

### Run artifact layout

- Keep the current student-readable generated artifacts under `workspace/<scenario>/`, using only the subdirectories `direct`, `train`, and `tdd`.
- Store each experiment's diagnostic record under `runs/<timestamp>-<scenario>-<short-id>/`, using `raw`, `test-output`, and `logs`.
- Store the machine-readable final summary as `runs/<run-id>/result.json` and structured events as `runs/<run-id>/logs/events.jsonl`.
- A new run for the same scenario replaces the three known generated files in that scenario's workspace. Historical diagnostic records remain under `runs/`.
- Keep `runs/` out of version control. Never store a provider credential or a complete environment configuration in a run directory.
- Vitest and Playwright use their built-in JSON reporters for machine-readable raw results. A small course-owned normalizer converts those reports into `TEST_ERROR`, `RED`, or `GREEN` plus counts and concise feedback for the console and repair agent.

### Environment configuration and preflight

- Use `dotenv` to load the selected environment file.
- Use Zod with `@t3-oss/env-core` for startup validation, type-safe access, transformations, defaults, and clear student-facing configuration errors.
- Enable empty-string-to-undefined handling.
- The only environment-file fields are `base_url`, `api_key`, and `model`. `model` supplies the default; the CLI may override it with `--model` for one complete run. Supported model IDs and their effective inference settings are versioned in code.
- Keep `thinking`, `enable_thinking`, `reasoning_effort`, `temperature`, and other experimental controls out of environment files. Apply them through one versioned runtime policy shared by every model stage.
- Load and validate configuration before starting the course interaction.
- Provide a separate pre-class `doctor` command that checks the selected file, schema, endpoint connectivity, credential validity, model availability, and a minimal non-empty response.
- Record doctor usage separately; it is not part of the Direct-versus-TDD experiment.

### Agent runtime

- Use the OpenAI Agents SDK for TypeScript (`@openai/agents`).
- Use its Chat Completions-compatible `OpenAIProvider` with the selected `base_url`, `api_key`, and `model`; do not assume the provider supports the Responses API.
- Do not add a separate `ModelGateway` or a general provider-repository abstraction.
- Use small, explicit agent construction helpers only where needed to avoid duplicated configuration.
- Direct implementation generation and train-test generation use a narrow `write_file` function tool restricted to the one authorized artifact.
- TDD repair uses the narrow local function tools `write_file` and `run_train_tests`; `write_file` is restricted to the TDD implementation artifact.
- The repair agent receives the frozen train tests and current failure feedback, decides what to change, writes only the TDD working artifact, runs the train suite, observes the result, and continues until Green or the existing repair limit.
- Each accepted `write_file` call during implementation repair consumes one of the three implementation-repair attempts. `run_train_tests` calls do not consume that budget.
- After the repair agent finishes, the orchestrator runs the train suite once if the latest implementation write has not yet been tested.
- Do not give the repair agent general shell access, unrestricted filesystem access, or validation access.
- Reliable function calling is an eligibility requirement for a classroom model. Test this explicitly during provider/model evaluation.
- Disable hosted Agents SDK tracing. Course prompts, generated code, tool inputs, and provider credentials must remain in the local artifact and diagnostic-log system.

### Model request limits and retries

- Do not set one arbitrary global model-output token cap in the initial implementation.
- Leave the SDK output-token limit unset initially and use the provider default while collecting truncation evidence.
- The initial comparison targets disabled model thinking and `temperature=0`. Apply exact model-specific mappings in the code-owned runtime policy. Models that cannot disable thinking use their lowest supported reasoning effort and are explicitly labeled `lowest-supported-thinking` in run artifacts; omit unsupported sampling controls rather than pretending they take effect. Doctor must verify each effective configuration before classroom evaluation.
- Bound work with agent turn limits, the implementation-repair limit, a 120-second per-model-call timeout, cancellation, and versioned active-work deadlines of 10 minutes for API and 15 minutes for GUI runs. Time spent waiting at teaching checkpoints does not consume the active-work deadline.
- Add a provider/model-specific token cap later only when empirical results show truncation or another concrete need.
- Use the Agents SDK as the single retry owner. Disable duplicate retry behavior in the underlying client.
- Retry only transient connection, timeout, rate-limit, and server failures according to an explicit SDK retry policy.
- Do not network-retry authentication, authorization, invalid-model, invalid-request, generated-code, test, or output-format failures.
- Allow one Agents SDK retry for transient connection failures, model-call timeouts, rate limits, retry-after responses, and HTTP 408/5xx failures. Use jittered exponential backoff from 1 to 5 seconds, respect provider retry advice, and display and log each retry decision. Revisit these values after additional provider measurements rather than exposing them through environment files.

### Usage measurement

- Record aggregate Agents SDK usage for every completed Direct, test-authoring, test-repair, and implementation-repair run.
- Record request count, input tokens, output tokens, total tokens, and per-request usage entries when provided.
- Preserve raw provider usage when supported so reasoning-token and provider-specific differences remain inspectable.
- Log the model configuration and start time before a run, then duration and reported usage after it.
- Console output may show a concise per-stage usage summary; the structured log and result artifact hold the complete data.

## Remaining Empirical Tuning

The initial execution and inference policies are implemented and versioned in code. Continue measuring provider behavior before changing their values:

- Re-evaluate retry counts, request timeouts, backoff bounds, and scenario deadlines after repeated API and GUI classroom runs.
- Extend model-specific request parameters and thinking/usage normalization only when a candidate endpoint supplies concrete compatibility evidence.

Do not let presentation or SDK choices expand the course into a framework-building exercise.
