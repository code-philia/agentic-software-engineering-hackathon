# GUI Train-Test Contract

Produce the complete contents of one executable Playwright file named `register.spec.ts`.

The runner provides the page URL in `process.env.COURSE_GUI_BASE_URL`. Import `test` and `expect` from `@playwright/test`. Also import the teacher-owned browser helpers you need from `./course-gui-test-support.js`: `controls`, `openRegistration`, `resetRegistration`, `uniqueRegistration`, `fillRegistration`, `submitRegistration`, `successFeedback`, `errorSummary`, `expectFieldError`, `expectFirstInvalid`, `expectRejection`, and `storageCorpus`. Use these helpers instead of redefining navigation, storage reset, unique valid identity generation, shared field locators, complete valid form filling, submission, field-error assertions, focus assertions, rejection assertions, or feedback locators. Treat the supplied browser page as the only application seam. The standard UI and reference implementation are unavailable to the model.

`controls(page)` returns these Locator properties: `heading`, `form`, `username`, `email`, `dateOfBirth` (with `dob` as an alias), `password`, `confirmPassword`, `terms`, `submit`, and `passwordToggle`. Do not assume any other property exists.

`fillRegistration(page, overrides)` sets every form control. Its defaults form a valid registration and accept the terms. A password override automatically becomes the confirmation unless `confirmPassword` is also supplied. To test missing terms, pass `{ terms: false }`; do not call `fillRegistration(page)` and then expect an unchecked checkbox.

`expectFieldError(page, field, pattern?)` accepts either a field name from `controls(page)` or the Locator itself; the message pattern is optional. `expectFirstInvalid(page, field?)` checks focus and defaults to the username. `expectRejection(page)` checks for visible rejection feedback and no success feedback. `storageCorpus(page)` is asynchronous; use `await storageCorpus(page)` to obtain its `Record<string, string>` of every localStorage key and value.

`uniqueRegistration()` synchronously returns a fresh valid `{ username, email }` pair. Use it whenever a test or table row needs unique valid identity data; never derive constrained identifiers from human-readable test labels.

Use `controls(page).passwordToggle` for the one Show/Hide action that toggles both password inputs. Do not replace it with another role or text locator.

Do not inspect the generated HTML, reference implementation, validation suite, repository files, or run artifacts. Do not read or write files, start processes or servers, dynamically load modules, inspect the working directory, or call external network services. Do not use screenshot or pixel comparison. Derive assertions only from the task, the supplied test-authoring instructions, and this contract.

Exercise the page through the supplied helpers plus accessible roles, labels, descriptions, and visible text. Do not depend on DOM hierarchy, CSS class names, or exact wording. Each test receives isolated browser state and must create its own prerequisites. Call `resetRegistration(page)` before ordinary independent scenarios; use `openRegistration(page)` or `page.reload()` when a persistence scenario must retain its own storage.

Every test must make a meaningful browser-observable assertion. Keep the suite focused and non-redundant and choose its coverage yourself.

Use only matchers documented by Playwright Test. Do not invent matcher names; when a convenience matcher does not exist, read the browser-observable value and assert it with standard `expect` primitives.

Design the complete suite to finish comfortably within 60 seconds on a local page using one Playwright worker. A broad suite that cannot finish within the runner budget is invalid even when its individual assertions are meaningful. Group related boundary examples inside a small number of scenario tests instead of expanding one Playwright test for every table row. Avoid repeated long visibility waits and keep shared helpers and assertions compact.

Do not pass malformed or non-existent dates to `fillRegistration`; a native date input rejects them before application code can observe them. Date coverage consists of one real date and omission only.

Do not assert an exact number of inputs, controls, containers, or other DOM nodes unless the task explicitly requires that number. For presentation checks, assert only the documented property; do not invent exact RGB values, pixel dimensions, shadows, DOM containers, or wording. The form may be transparent inside a visible white registration panel. Classify broad colors by parsing and comparing computed numeric channels, not by matching the browser's serialized RGB string with a handcrafted regular expression.

Write the complete TypeScript test source to the authorized `register.spec.ts` path with the provided `write_file` tool. Pass source code only as `content`; do not wrap it in Markdown fences or add commentary.
