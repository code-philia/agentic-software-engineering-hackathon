# GUI Train-Test Contract

Produce the complete contents of one executable Playwright file named `register.spec.ts`.

The runner provides the page URL in `process.env.COURSE_GUI_BASE_URL`. Import `test` and `expect` from `@playwright/test`. Treat the supplied browser page as the only test seam. The standard UI and reference implementation are unavailable to the model.

Do not inspect the generated HTML, reference implementation, validation suite, repository files, or run artifacts. Do not read or write files, start processes or servers, dynamically load modules, inspect the working directory, or call external network services. Do not use screenshot or pixel comparison. Derive assertions only from the task, the supplied test-authoring instructions, and this contract.

Exercise the page through accessible roles, labels, descriptions, and visible text. Do not depend on DOM hierarchy, CSS class names, or exact wording. Each test receives isolated browser state and must create its own prerequisites.

Every test must make a meaningful browser-observable assertion. Keep the suite focused and non-redundant and choose its coverage yourself.

Design the complete suite to finish comfortably within 60 seconds on a local page using one Playwright worker. A broad suite that cannot finish within the runner budget is invalid even when its individual assertions are meaningful. Group related boundary examples inside a small number of scenario tests instead of expanding one Playwright test for every table row. Avoid repeated long visibility waits and keep shared helpers and assertions compact.

Do not assert an exact number of inputs, controls, containers, or other DOM nodes unless the task explicitly requires that number. For presentation checks, assert only the documented property; do not invent exact RGB values, pixel dimensions, shadows, DOM containers, or wording.

Write the complete TypeScript test source to the authorized `register.spec.ts` path with the provided `write_file` tool. Pass source code only as `content`; do not wrap it in Markdown fences or add commentary.
