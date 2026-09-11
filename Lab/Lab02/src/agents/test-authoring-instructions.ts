import type { CourseScenario } from "./generate.js";

const REGISTRATION_FIELD_INSTRUCTIONS = `Treat the following registration policy as authoritative when choosing test behavior. Use representative values of your own choosing and exercise meaningful boundaries without reproducing or attempting to discover the validation suite.

Username policy:
- Ignore surrounding whitespace.
- After trimming, a username is 3 to 20 characters long.
- It starts with an ASCII letter; remaining characters may be ASCII letters, digits, or underscores.
- Duplicate comparison is case-insensitive and uses the trimmed value.
- Successful output preserves the trimmed spelling.

Email policy:
- Ignore surrounding whitespace and normalize successful output to lowercase.
- Require one local part, one at-sign, and a multi-label domain.
- Reject whitespace, missing components, repeated dots, dot-bounded local parts, and empty or hyphen-bounded domain labels.
- Do not exercise disputed quoted-local-part, SMTPUTF8, DNS, or MX behavior.
- Duplicate comparison uses the normalized email address.

Password and date policy:
- A password is 10 to 64 characters long and contains at least one ASCII letter and one digit.
- Letter case is otherwise unrestricted: lowercase-only or uppercase-only letters are valid when the password also contains a digit. Do not invent a mixed-case requirement.
- Use verified valid fixtures such as Password01 or Abcdefghi1; each is exactly 10 characters. Password1 and Abcdefgh1 are only 9 characters and are invalid fixtures.
- For the inclusive 64-character maximum boundary, use 'A1' + 'x'.repeat(62), which is exactly 64 characters.
- Password confirmation matches exactly. Do not trim either password value.
- Date of birth is optional. When supplied, it is a string in exact YYYY-MM-DD form and represents a real Gregorian calendar date.

Test-data integrity:
- Every value intended to be valid must satisfy all applicable rules simultaneously.
- Audit shared fixtures, default payloads, and helper-generated values against every documented boundary before writing the suite.
- Keep constrained identifiers deterministic and visibly within their maximum lengths.
- Do not use Date.now(), Math.random(), UUIDs, or other unbounded values to construct usernames. Prefer a short module-level sequence such as User_1, User_2, and so on.
- Never derive usernames or email addresses directly from human-readable test titles, row labels, or failure descriptions; those strings often contain spaces or punctuation and silently invalidate a companion field.
- Prefer data-driven tables for similar boundary cases instead of repetitive tests.
`;

const API_TEST_AUTHORING_INSTRUCTIONS = `${REGISTRATION_FIELD_INSTRUCTIONS}
API state and response policy:
- If cases expected to return 201 instead receive password-related 400 responses, audit and correct the shared password and password-confirmation fixture before changing individual expectations. A shared 9-character fixture can invalidate every nominal success case.
- Invalid attempts do not reserve usernames or email addresses.
- A conflict involving one identifier does not reserve the other identifier.
- Validate submitted fields before reporting duplicate identifiers.
- Successful registrations return distinct, non-empty session tokens.
- Successful responses contain only the documented public fields.
- Error responses never echo submitted password values.
- When asserting an expected HTTP status, include the received response body as a safe assertion message so a failure explains the response. Do not include the submitted request or password values in that message.

Cover success, rejection, normalization, boundaries, state transitions, response shape, and sensitive-data safety with focused, non-redundant tests.`;

const GUI_TEST_AUTHORING_INSTRUCTIONS = `${REGISTRATION_FIELD_INSTRUCTIONS}

The train suite is the specification-discovery stage. Convert the concrete rules below into a compact set of executable, browser-observable scenarios whose failures clearly guide an implementation repair. Choose the number of tests yourself; coverage quality and reliability matter more than test count.

Prioritize these behavior families:
- Accessible structure: a semantic registration heading and form, English labels, suitable email/date/password input types, useful autocomplete metadata, an accessible terms checkbox, and a submit-specific primary action. Match the heading with /register|create.*account|sign up/i because natural product wording may vary.
- Validation feedback: one empty submission reports all required problems, associates visible explanations with invalid controls, exposes an alert summary, and focuses the first invalid field. A corrected valid submission clears stale invalid state and obsolete summary feedback.
- Field policy: exercise representative username, email, password, confirmation, terms, and optional-date boundaries. Group related examples in tables rather than separate top-level tests.
- Interaction: one accessible Show/Hide password action toggles both password inputs and updates its accessible name.
- Persistence: a successful padded mixed-case username is stored with surrounding whitespace removed, its email is lowercased, duplicate username and email checks survive reload, rejected attempts reserve nothing, and stored data contains neither password values nor password-named properties.
- Presentation and responsive layout: cover the public visual direction in one compact scenario without screenshots or pixel comparison. Check broad browser-observable properties rather than exact styling: a semantic full-width dark navy-blue service header, a pale blue-gray page surrounding a centered white registration panel, a restrained orange accent on the primary submit action, related fields sharing rows on a typical desktop viewport, a single-column form without horizontal overflow on a narrow mobile viewport, and a clearly visible keyboard focus indicator.

Reliability rules:
- Keep the suite comfortably within the 60-second one-worker budget. Aim for roughly 220 source lines or fewer and preferably below 12,000 source characters, but prioritize a correct executable suite over an arbitrary test or line count. Use small shared helpers and omit comments, decorative copy, and duplicate assertions.
- Use the supplied resetRegistration helper at the start of ordinary independent tests and boundary rows. In each persistence or duplicate scenario, call it exactly once before creating the prerequisite account. After that account succeeds, do not call resetRegistration or localStorage.clear until every reload and username/email conflict assertion in that scenario is complete; use openRegistration or page.reload to retain saved state.
- Use the supplied controls, uniqueRegistration, fillRegistration, submitRegistration, successFeedback, errorSummary, expectFieldError, expectFirstInvalid, expectRejection, and storageCorpus helpers rather than recreating their browser plumbing or identity generation. The documented controls properties are heading, form, username, email, dateOfBirth (or its dob alias), password, confirmPassword, terms, submit, and passwordToggle; do not invent other properties. Never define replacement field-error, focus, or rejection helpers and never use exact label strings for shared fields. uniqueRegistration() returns a fresh valid username/email pair; use it instead of building constrained values from row labels. Override only the field values relevant to a scenario; fillRegistration keeps all companion fields valid and synchronizes password confirmation by default.
- For password visibility, use controls(page).passwordToggle. Do not create a separate Show/Hide role locator; the supplied locator intentionally identifies the single action that should toggle both password fields.
- fillRegistration accepts terms by default. A missing-terms scenario must call fillRegistration(page, { terms: false }) before submission.
- Use deterministic short identifiers; never use timestamps, randomness, or UUIDs.
- Do not replace the supplied robust locators with narrower alternatives. Locate the form with locator('form'); an unnamed semantic form is valid but does not have the accessible form role. Do not rely on CSS classes, DOM hierarchy, exact wording, or exact control counts.
- Audit boundary literals before writing: a valid minimum-length username needs three characters, such as Ab3. Do not mark a two-character trimmed value such as '  Ab  ' valid.
- When a boundary row overrides the password, set confirmation to that same value unless the row is specifically testing a mismatch. Otherwise the companion field, rather than the boundary under test, causes the rejection.
- A password-confirmation mismatch belongs to confirmPassword, not password. Do not assert a password-field error for every rejected row in a combined password table; assert the field that owns that row's rule.
- Inspect storage generically across localStorage values without assuming a key or schema. Assert semantic public data and ensure the exact password and any password-named property are absent.
- Every supplied browser helper is asynchronous when its return type is a Promise. Always await storageCorpus before using Object.keys, Object.values, or other record operations on its result.
- Do not make a username boundary value unique by adding a prefix or suffix, because that changes its tested length and syntax. Keep the exact username boundary value and make the valid companion email unique instead.
- In a duplicate scenario, keep the first account in storage while testing both its username and email conflicts. If you clear storage between conflict checks, recreate the prerequisite account before expecting another duplicate rejection.
- To verify that a rejected attempt reserves nothing, use valid username and email identifiers with an invalid companion field such as a short password or missing terms, then fix only that companion and retry the same identifiers. A syntactically invalid username or email remains invalid and cannot demonstrate reservation atomicity.
- An alert summary may report only the number of problems. Do not require it to list field names or exact messages; verify field-specific feedback through each control's accessible description or aria-describedby targets.
- To verify focus after invalid submission, use await expectFirstInvalid(page). Never compare two Locator objects with toBe or toEqual.
- Native date controls reject malformed values before application code sees them. Never put an invalid date in fillRegistration, including February 29 in a non-leap year. Test exactly the supported date behaviors: a real Gregorian date and an omitted date. Do not mutate input types or prototype setters to manufacture an impossible date.
- Keep presentation checks qualitative and implementation-independent. Locate public elements through semantic roles and the supplied controls, inspect computed styles or bounding boxes only when needed, and do not assert exact RGB values, fixed pixel dimensions, shadows, CSS classes, or DOM nesting.
- Use only documented Playwright matchers, make every test assert meaningful behavior, and write the complete suite in one write_file call.`;

export function testAuthoringInstructions(scenario: CourseScenario): string {
  return scenario === "api"
    ? API_TEST_AUTHORING_INSTRUCTIONS
    : GUI_TEST_AUTHORING_INSTRUCTIONS;
}
