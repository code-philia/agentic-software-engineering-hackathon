# API Train-Test Contract

Produce the complete contents of one executable Vitest file named `register.test.ts`.

The teacher-owned runner starts a fresh API server and provides its origin in `process.env.COURSE_API_BASE_URL`. Exercise only `POST /api/register` through built-in `fetch`. Treat the supplied HTTP endpoint as the only test seam.

Do not import or inspect the generated implementation, reference implementation, validation suite, repository files, or run artifacts. Do not read or write files, start processes or servers, dynamically load modules, inspect the working directory, or call external network services. Derive assertions only from the task, the supplied test-authoring instructions, and this contract.

Send JSON requests with the fields `username`, `email`, optional `dateOfBirth`, `password`, and `confirmPassword`. Expect JSON responses with these conventions:

- Success: HTTP `201` with exactly `username`, `email`, optional `dateOfBirth`, and a new non-empty `sessionToken`.
- Invalid JSON, body shape, or registration details: HTTP `400` with a non-empty `error` string.
- Duplicate username or email: HTTP `409` with a non-empty `error` string.

Tests must create their own state and not depend on execution order. Keep the suite focused and non-redundant; choose its coverage yourself.

Every test must make a meaningful assertion about supported behavior.

Write the complete TypeScript test source to the authorized `register.test.ts` path with the provided `write_file` tool. Pass source code only as `content`; do not wrap it in Markdown fences or add commentary.
