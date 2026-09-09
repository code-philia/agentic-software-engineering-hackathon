# API Implementation Contract

Produce the complete contents of one TypeScript file named `register.ts`.

The file must default-export a handler with this public shape:

```ts
type RegistrationHandler = (request: Request) => Response | Promise<Response>;
```

The teacher-owned HTTP adapter calls the handler for `POST /api/register`. Read the JSON request body using standard Web APIs. Do not start a server in the generated file.

Use the request fields `username`, `email`, optional `dateOfBirth`, `password`, and `confirmPassword`.

Treat malformed JSON and JSON values other than a non-array object as invalid requests.

Return JSON responses with these conventions:

- Success: HTTP `201` with exactly `username`, `email`, optional `dateOfBirth`, and a new non-empty `sessionToken`.
- Invalid JSON, body shape, or registration details: HTTP `400` with a non-empty `error` string.
- Duplicate username or email: HTTP `409` with a non-empty `error` string.

Keep registration state in memory. Use only built-in JavaScript and Web APIs; do not import packages.

Write the complete TypeScript source to the authorized `register.ts` path with the provided `write_file` tool. Pass source code only as `content`; do not wrap it in Markdown fences or add commentary.
