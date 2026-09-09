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
- Password confirmation matches exactly. Do not trim either password value.
- Date of birth is optional. When supplied, it is a string in exact YYYY-MM-DD form and represents a real Gregorian calendar date.

Test-data integrity:
- Every value intended to be valid must satisfy all applicable rules simultaneously.
- Audit shared fixtures, default payloads, and helper-generated values against every documented boundary before writing the suite.
- Keep constrained identifiers deterministic and visibly within their maximum lengths.
- Do not use Date.now(), Math.random(), UUIDs, or other unbounded values to construct usernames. Prefer a short module-level sequence such as User_1, User_2, and so on.
- Prefer data-driven tables for similar boundary cases instead of repetitive tests.
`;

const API_TEST_AUTHORING_INSTRUCTIONS = `${REGISTRATION_FIELD_INSTRUCTIONS}
API state and response policy:
- Invalid attempts do not reserve usernames or email addresses.
- A conflict involving one identifier does not reserve the other identifier.
- Validate submitted fields before reporting duplicate identifiers.
- Successful registrations return distinct, non-empty session tokens.
- Successful responses contain only the documented public fields.
- Error responses never echo submitted password values.
- When asserting an expected HTTP status, include the received response body as a safe assertion message so a failure explains the response. Do not include the submitted request or password values in that message.

Cover success, rejection, normalization, boundaries, state transitions, response shape, and sensitive-data safety with focused, non-redundant tests.`;

const GUI_TEST_AUTHORING_INSTRUCTIONS = `${REGISTRATION_FIELD_INSTRUCTIONS}

Apply the registration policy through browser-observable behavior, with these additional requirements:

Accessibility and feedback:
- The page has a semantic registration heading and one form.
- Every data field has an accessible English label, a suitable input type, and useful autocomplete metadata.
- Terms acceptance is required.
- Invalid controls have associated visible explanations, one submission reports all current problems, and an error summary is visible.
- Focus moves to the first invalid control, and corrected submissions clear stale error state.
- Important error and success feedback uses alert, status, or live-region semantics.

Interaction and persistence:
- One accessible control reveals both password fields and hides them again; its accessible name communicates the available action.
- Successful normalized public account details survive page reloads.
- Successful registration requires readable success feedback, but the page does not have to visibly echo the username, email, or date of birth. Verify persisted normalized details through browser storage or subsequent duplicate behavior instead of requiring those values in the success message.
- Passwords and password-related properties are never stored.
- Duplicate identifiers remain unavailable after reload, invalid attempts reserve nothing, and multiple distinct accounts can be retained.

Browser-safe test construction:
- Keep the suite compact enough to finish comfortably within 60 seconds on a local page with one Playwright worker.
- Group related boundary examples within a small number of scenario tests. Do not expand every row of a boundary table into a separate Playwright test.
- Native date inputs reject some malformed or impossible values before the application receives them. Do not call locator.fill() with a value the browser rejects and treat Playwright's "Malformed value" error as application behavior. If testing an impossible calendar date, use a browser-valid interaction strategy that still submits the value through the public page.
- Do not assert exact control counts, DOM structure, fixed wording, or implementation-specific storage keys and schemas unless the execution contract requires them.
- Avoid repeated long visibility waits. Prefer assertions that fail promptly and identify the behavior being checked.

Presentation:
- Use a full-width dark-blue header and a pale blue-gray page background.
- Center a white registration panel with a restrained shadow and a narrow orange top accent.
- Use orange for the primary action and place labels above their controls.
- Keyboard focus is clearly visible.
- At a 375-pixel viewport, related fields form one column and the page has no horizontal scrolling.

Prefer accessible roles, labels, descriptions, and visible behavior. Use computed styles only for the presentation requirements above. Assert only the named presentation property, using broad qualitative checks rather than invented exact RGB values, pixel dimensions, container structure, or wording. Do not use screenshot or pixel-perfect comparison.`;

export function testAuthoringInstructions(scenario: CourseScenario): string {
  return scenario === "api"
    ? API_TEST_AUTHORING_INSTRUCTIONS
    : GUI_TEST_AUTHORING_INSTRUCTIONS;
}
