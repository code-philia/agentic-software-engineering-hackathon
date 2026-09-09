import { expect, test } from "vitest";

const baseUrl = process.env.COURSE_API_BASE_URL;
if (!baseUrl) throw new Error("COURSE_API_BASE_URL is required.");

let sequence = 0;
function validRegistration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  sequence += 1;
  return { username: `User_${sequence}`, email: `user.${sequence}@example.com`, password: "CoursePass9", confirmPassword: "CoursePass9", ...overrides };
}
async function register(body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/api/register`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
async function registerRaw(body: string): Promise<Response> {
  return fetch(`${baseUrl}/api/register`, { method: "POST", headers: { "content-type": "application/json" }, body });
}
async function json(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

test("[Core registration behavior] registers a valid account and returns normalized public details", async () => {
  const response = await register(validRegistration({ username: "  Alice_7  ", email: "  Alice.Seven@Example.COM  " }));
  expect(response.status).toBe(201);
  expect(await json(response)).toMatchObject({ username: "Alice_7", email: "alice.seven@example.com" });
});
test("[Core registration behavior] accepts and returns a real optional date of birth", async () => {
  const response = await register(validRegistration({ dateOfBirth: "2000-02-29" }));
  expect(response.status).toBe(201); expect((await json(response)).dateOfBirth).toBe("2000-02-29");
});
test("[Core registration behavior] allows date of birth to be omitted", async () => {
  const body = await json(await register(validRegistration())); expect(body).not.toHaveProperty("dateOfBirth");
});
test("[Core registration behavior] accepts representative ordinary email forms", async () => {
  for (const email of ["alex.smith+course@example.com", "user_2@sub.example.org", "student-9@service.co.uk"]) expect((await register(validRegistration({ email }))).status, email).toBe(201);
});
test("[Core registration behavior] accepts username length boundaries", async () => {
  for (const username of ["Ab3", `A${"b".repeat(19)}`]) expect((await register(validRegistration({ username }))).status, username).toBe(201);
});
test("[Core registration behavior] accepts password length boundaries with required character kinds", async () => {
  for (const password of ["abcdefgh9Z", `${"a".repeat(62)}9Z`]) expect((await register(validRegistration({ password, confirmPassword: password }))).status).toBe(201);
});
test("[Core registration behavior] creates a different non-empty token for each account", async () => {
  const first = await json(await register(validRegistration())); const second = await json(await register(validRegistration()));
  expect(String(first.sessionToken).trim()).not.toBe(""); expect(second.sessionToken).not.toBe(first.sessionToken);
});
test("[Core registration behavior] preserves the normalized username spelling", async () => {
  const body = await json(await register(validRegistration({ username: "  Mixed_Case9  " }))); expect(body.username).toBe("Mixed_Case9");
});
test("[Core registration behavior] treats spaces inside an otherwise valid password as data", async () => {
  const password = " Abcdefg9 "; expect((await register(validRegistration({ password, confirmPassword: password }))).status).toBe(201);
});
test("[Core registration behavior] accepts an ordinary non-leap-year date", async () => {
  const response = await register(validRegistration({ dateOfBirth: "1900-02-28" })); expect(response.status).toBe(201);
});

test("[Input validation] rejects every missing or non-string required field", async () => {
  for (const [field, value] of [["username", undefined], ["email", 42], ["password", null], ["confirmPassword", true]] as const) { const input = validRegistration(); if (value === undefined) delete input[field]; else input[field] = value; expect((await register(input)).status, field).toBe(400); }
});
test("[Input validation] rejects malformed JSON", async () => {
  expect((await registerRaw("{not-json")).status).toBe(400);
});
test("[Input validation] rejects JSON bodies that are not objects", async () => {
  for (const body of [null, [], "registration"]) expect((await register(body)).status).toBe(400);
});
test("[Input validation] rejects usernames outside the stated format", async () => {
  for (const username of ["Ab", `A${"b".repeat(20)}`, "1alice", "alice-name", "alice name", "álîce"]) expect((await register(validRegistration({ username }))).status, username).toBe(400);
});
test("[Input validation] rejects email addresses without one complete at-sign pair", async () => {
  for (const email of ["plainaddress", "missing@", "@example.com", "two@@example.com"]) expect((await register(validRegistration({ email }))).status, email).toBe(400);
});
test("[Input validation] rejects whitespace and invalid dot placement in an email local part", async () => {
  for (const email of ["a b@example.com", ".leading@example.com", "trailing.@example.com", "double..dot@example.com"]) expect((await register(validRegistration({ email }))).status, email).toBe(400);
});
test("[Input validation] rejects empty or hyphen-bounded email domain labels", async () => {
  for (const email of ["user@example..com", "user@-example.com", "user@example-.com"]) expect((await register(validRegistration({ email }))).status, email).toBe(400);
});
test("[Input validation] rejects an email domain without multiple labels", async () => {
  expect((await register(validRegistration({ email: "user@example" }))).status).toBe(400);
});
test("[Input validation] rejects passwords outside the length range", async () => {
  for (const password of ["Short9", `${"a".repeat(64)}9`]) expect((await register(validRegistration({ password, confirmPassword: password }))).status).toBe(400);
});
test("[Input validation] rejects passwords missing a letter or a number", async () => {
  for (const password of ["1234567890", "abcdefghij"]) expect((await register(validRegistration({ password, confirmPassword: password }))).status).toBe(400);
});
test("[Input validation] rejects mismatched password confirmation", async () => {
  expect((await register(validRegistration({ confirmPassword: "CoursePass8" }))).status).toBe(400);
});
test("[Input validation] rejects a non-string date of birth", async () => {
  expect((await register(validRegistration({ dateOfBirth: 20000101 }))).status).toBe(400);
});
test("[Input validation] requires the exact date-of-birth format", async () => {
  for (const dateOfBirth of ["2001-2-03", "not-a-date"]) expect((await register(validRegistration({ dateOfBirth }))).status).toBe(400);
});
test("[Input validation] rejects impossible calendar dates", async () => {
  for (const dateOfBirth of ["2023-02-29", "2024-04-31"]) expect((await register(validRegistration({ dateOfBirth }))).status).toBe(400);
});
test("[Input validation] rejects a username that normalizes to an empty value", async () => {
  expect((await register(validRegistration({ username: "   " }))).status).toBe(400);
});
test("[Input validation] rejects an email that normalizes to an empty value", async () => {
  expect((await register(validRegistration({ email: "   " }))).status).toBe(400);
});
test("[Input validation] rejects an explicitly supplied empty date", async () => {
  expect((await register(validRegistration({ dateOfBirth: "" }))).status).toBe(400);
});
test("[Input validation] applies Gregorian leap-year rules at century boundaries", async () => {
  expect((await register(validRegistration({ dateOfBirth: "1900-02-29" }))).status).toBe(400);
});
test("[Input validation] does not trim passwords before comparing confirmation", async () => {
  expect((await register(validRegistration({ password: " CoursePass9", confirmPassword: "CoursePass9" }))).status).toBe(400);
});
test("[State and duplicate handling] rejects an exact duplicate username", async () => {
  const first = validRegistration(); expect((await register(first)).status).toBe(201); expect((await register(validRegistration({ username: first.username }))).status).toBe(409);
});
test("[State and duplicate handling] rejects a username duplicate with different case or surrounding whitespace", async () => {
  expect((await register(validRegistration({ username: "Case_User" }))).status).toBe(201); expect((await register(validRegistration({ username: "  case_user  " }))).status).toBe(409);
});
test("[State and duplicate handling] rejects an exact duplicate email", async () => {
  const first = validRegistration(); expect((await register(first)).status).toBe(201); expect((await register(validRegistration({ email: first.email }))).status).toBe(409);
});
test("[State and duplicate handling] rejects an email duplicate after case and whitespace normalization", async () => {
  expect((await register(validRegistration({ email: "Mixed.Case@Example.com" }))).status).toBe(201); expect((await register(validRegistration({ email: "  MIXED.CASE@EXAMPLE.COM  " }))).status).toBe(409);
});
test("[State and duplicate handling] does not reserve details from a rejected request", async () => {
  const input = validRegistration({ confirmPassword: "wrong-value" }); expect((await register(input)).status).toBe(400); input.confirmPassword = input.password; expect((await register(input)).status).toBe(201);
});
test("[State and duplicate handling] permits registrations when both normalized identifiers are distinct", async () => {
  expect((await register(validRegistration())).status).toBe(201); expect((await register(validRegistration())).status).toBe(201);
});
test("[State and duplicate handling] validates fields before reporting a duplicate", async () => {
  const first = validRegistration(); expect((await register(first)).status).toBe(201); const invalidDuplicate = validRegistration({ username: first.username, password: "bad", confirmPassword: "bad" }); expect((await register(invalidDuplicate)).status).toBe(400);
});
test("[State and duplicate handling] a username conflict does not reserve the accompanying email", async () => {
  const first = validRegistration(); await register(first); const attempted = validRegistration({ username: first.username }); expect((await register(attempted)).status).toBe(409); expect((await register(validRegistration({ email: attempted.email }))).status).toBe(201);
});
test("[State and duplicate handling] an email conflict does not reserve the accompanying username", async () => {
  const first = validRegistration(); await register(first); const attempted = validRegistration({ email: first.email }); expect((await register(attempted)).status).toBe(409); expect((await register(validRegistration({ username: attempted.username }))).status).toBe(201);
});
test("[State and duplicate handling] an invalid email does not reserve an otherwise valid username", async () => {
  const attempted = validRegistration({ email: "invalid" }); expect((await register(attempted)).status).toBe(400); expect((await register(validRegistration({ username: attempted.username }))).status).toBe(201);
});
test("[State and duplicate handling] an invalid username does not reserve an otherwise valid email", async () => {
  const attempted = validRegistration({ username: "?" }); expect((await register(attempted)).status).toBe(400); expect((await register(validRegistration({ email: attempted.email }))).status).toBe(201);
});
test("[State and duplicate handling] an invalid date does not reserve either identifier", async () => {
  const attempted = validRegistration({ dateOfBirth: "2023-02-29" }); expect((await register(attempted)).status).toBe(400); delete attempted.dateOfBirth; expect((await register(attempted)).status).toBe(201);
});
test("[State and duplicate handling] duplicate checks use normalized identifiers together", async () => {
  const first = validRegistration({ username: "Normalized_User", email: "normalized@example.com" }); await register(first); expect((await register(validRegistration({ username: " normalized_user ", email: " NORMALIZED@EXAMPLE.COM " }))).status).toBe(409);
});
test("[Response contract and safety] returns JSON and exactly the allowed success fields", async () => {
  const response = await register(validRegistration()); expect(response.headers.get("content-type")).toMatch(/^application\/json\b/i); expect(Object.keys(await json(response)).sort()).toEqual(["email", "sessionToken", "username"]);
});
test("[Response contract and safety] includes only the optional public date field when supplied", async () => {
  const body = await json(await register(validRegistration({ dateOfBirth: "1998-12-31" }))); expect(Object.keys(body).sort()).toEqual(["dateOfBirth", "email", "sessionToken", "username"]);
});
test("[Response contract and safety] returns a non-empty JSON error for invalid input", async () => {
  const response = await register(validRegistration({ username: "?" })); const body = await json(response); expect(response.status).toBe(400); expect(response.headers.get("content-type")).toMatch(/^application\/json\b/i); expect(String(body.error).trim()).not.toBe("");
});
test("[Response contract and safety] returns a non-empty JSON error for a duplicate", async () => {
  const input = validRegistration(); await register(input); const response = await register(input); expect(response.status).toBe(409); expect(String((await json(response)).error).trim()).not.toBe("");
});
test("[Response contract and safety] never exposes password field names or password values on success", async () => {
  const input = validRegistration({ password: "SecretValue7", confirmPassword: "SecretValue7" }); const source = JSON.stringify(await json(await register(input))); expect(source.toLowerCase()).not.toContain("password"); expect(source).not.toContain("SecretValue7");
});
test("[Response contract and safety] never echoes sensitive input in validation errors", async () => {
  const secret = "SensitiveValue7"; const source = JSON.stringify(await json(await register(validRegistration({ password: secret, confirmPassword: "different7A" })))); expect(source).not.toContain(secret); expect(source.toLowerCase()).not.toContain("confirmpassword");
});
test("[Response contract and safety] consistently uses the documented status for each outcome", async () => {
  const input = validRegistration(); expect((await register(input)).status).toBe(201); expect((await register(input)).status).toBe(409); expect((await register(validRegistration({ email: "invalid" }))).status).toBe(400);
});
test("[Response contract and safety] returns a JSON error for malformed JSON", async () => {
  const response = await registerRaw("{"); expect(response.status).toBe(400); expect(response.headers.get("content-type")).toMatch(/^application\/json\b/i); expect(String((await json(response)).error).trim()).not.toBe("");
});
test("[Response contract and safety] returns a JSON error for an invalid body shape", async () => {
  const response = await register([]); expect(response.status).toBe(400); expect(String((await json(response)).error).trim()).not.toBe("");
});
test("[Response contract and safety] returns public values with the documented types", async () => {
  const body = await json(await register(validRegistration())); expect(typeof body.username).toBe("string"); expect(typeof body.email).toBe("string"); expect(typeof body.sessionToken).toBe("string");
});
test("[Response contract and safety] does not add an undefined optional date field", async () => {
  const body = await json(await register(validRegistration({ dateOfBirth: undefined }))); expect(Object.prototype.hasOwnProperty.call(body, "dateOfBirth")).toBe(false);
});
test("[Response contract and safety] duplicate errors do not expose the submitted password value", async () => {
  const first = validRegistration(); await register(first); const secret = "DuplicateSecret9"; const body = await json(await register(validRegistration({ username: first.username, password: secret, confirmPassword: secret }))); expect(JSON.stringify(body)).not.toContain(secret);
});
test("[Response contract and safety] body-shape errors use the documented error property", async () => {
  const body = await json(await register(null)); expect(typeof body.error).toBe("string"); expect((body.error as string).trim().length).toBeGreaterThan(0);
});
