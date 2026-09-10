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
- Use verified valid fixtures such as Password01 or Abcdefghi1; each is exactly 10 characters. Password1 and Abcdefgh1 are only 9 characters and are invalid fixtures.
- For the inclusive 64-character maximum boundary, use 'A1' + 'x'.repeat(62), which is exactly 64 characters.
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

Apply the registration policy through browser-observable behavior, with these additional requirements:

The train suite is the specification-discovery stage of this exercise. It receives more concrete acceptance criteria than the implementation agent did. Turn those criteria into executable tests so failures give the later repair agent precise, actionable evidence.

Output budget is a correctness requirement:
- Write exactly one compact suite in exactly one write_file call. Do not narrate, draft, continue, or rewrite it across turns.
- Produce exactly 8 top-level Playwright tests, at most 320 source lines, and preferably no more than 14,000 source characters.
- Put related examples in arrays and loops inside one test. Use small shared helpers for fields, valid submission, storage corpus, error association, colors, and layout.
- Omit comments, decorative separators, repeated setup, and duplicate assertions. If the suite is approaching the budget, simplify implementation rather than omitting one of the eight scenarios.

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
- Cover the complete state lifecycle, not only one successful submission. Verify that normalized username spelling, lowercase email, and an optional date survive reload without depending on a particular storage key or object schema.
- Verify username and email conflicts independently after reload. A conflict involving one identifier must not reserve a different, otherwise available identifier.
- Verify that adding a second distinct account preserves the first account instead of overwriting it.
- Follow representative rejected submissions with corrected valid submissions that reuse their identifiers. Include invalid field data, missing terms, and a duplicate conflict across the suite so partial or rejected attempts cannot silently mutate persistent state. Include an impossible date only when the public browser interaction can actually deliver that non-empty value to the application.
- Exercise error-state transitions as behavior: one submission exposes all current problems, correcting fields removes their stale explanations and invalid state, and a later successful submission clears obsolete summary feedback.
- When inspecting browser storage, examine the origin's stored values generically and assert semantic public data rather than assuming key names or a private schema. Ensure the exact password and confirmation values, and password-named properties, are absent from the serialized storage corpus.
- Treat persistence, rejection atomicity, and error cleanup as independent coverage families. Do not let one happy-path test stand in for all three.

Browser-safe test construction:
- Keep the suite compact enough to finish comfortably within 60 seconds on a local page with one Playwright worker.
- Group related boundary examples within a small number of scenario tests. Do not expand every row of a boundary table into a separate Playwright test.
- Native date inputs reject some malformed or impossible values before the application receives them. Do not call locator.fill() with a value the browser rejects and treat Playwright's "Malformed value" error as application behavior.
- Never assign an impossible value to an input[type=date], observe that the browser changed it to an empty string, submit the form, and then assert that no account was stored. Date of birth is optional, so that empty value is a valid submission and the assertion would be wrong.
- Test a real date and omission. Test an impossible calendar date only if a browser-valid public interaction leaves the exact non-empty impossible value in the control for submission; otherwise omit that case entirely. Do not change the input type or application DOM to manufacture the condition.
- Locate the password field with a prefix matcher that excludes confirmation, such as getByLabel(/^password(?!.*confirm)/i). Do not require its full accessible name to equal exactly Password, because valid labels may include a required marker or help text.
- Locate terms with page.getByRole('checkbox', { name: /terms/i }). Do not use getByLabel(/^terms/i): a valid accessible name may begin with words such as "I accept the" before "terms". Reuse this exact checkbox locator in shared helpers.
- Locate the primary action with page.locator('button[type="submit"]') or an equivalent submit-specific locator. When checking that the primary action is orange, inspect getComputedStyle(element).backgroundColor, not its text color.
- To verify that a label is above its control, start from the accessible control and use its standard labels collection inside evaluate, for example \`el.labels?.[0]\`, then compare the label and control bounding rectangles. Do not search for an ancestor label: valid explicit \`label[for]\` markup makes the label a sibling rather than an ancestor.
- Do not assert exact control counts, DOM structure, fixed wording, or implementation-specific storage keys and schemas unless the execution contract requires them.
- Avoid repeated long visibility waits. Prefer assertions that fail promptly and identify the behavior being checked.
- Use only documented Playwright Test matchers. Do not invent convenience matchers such as numeric count variants; read a value such as locator.count() and use a standard expect assertion when needed.

The required eight executable scenarios are:
1. Accessibility plus empty submission: semantic heading and locator('form'), accessible labels, required email/date/password input types and autocomplete, all required controls invalid together with associated explanations, role=alert summary, first-invalid focus, and live/status feedback. Do not require an explicit type="text" attribute on username: a missing type is valid HTML text-input behavior.
2. Error recovery: record each username aria-describedby target and its text before the invalid submission; after the error, identify targets that changed from empty to non-empty. After successful correction, accept each such target being dereferenced, removed, hidden, or empty. Also assert aria-invalid is no longer true and the obsolete summary is hidden or empty. Permanent hint text and a stable empty error-node ID may remain.
3. Field policy: data-driven username 3/20 boundaries and invalid formats, malformed emails, password 10/64 boundaries and composition/confirmation, required terms, and present/omitted valid dates. Before every independent table row, clear browser storage and reload, or guarantee that both username and email are unique even across every successful row. Because persistence is covered separately, clearing storage between these boundary rows is preferred. Fill otherwise-valid companion fields and explicitly call check() or uncheck() so checkbox state never leaks from a previous row.
4. Normalization and safe persistence: padded mixed-case identity becomes the same mixed-case username with only surrounding whitespace removed, plus lowercase email, in generic browser-storage inspection, with no password values or password-named properties. If submittedUsername is '  MiXeD_1  ', assert storage contains submittedUsername.trim() ('MiXeD_1'); do not compare it with a differently-cased generator variable.
5. Duplicate atomicity: after reload, exercise username and email conflicts independently, prove the unaffected identifier remains available, and prove rejected attempts reserve nothing.
6. Multiple accounts: two distinct successful accounts survive reload without overwriting one another.
7. Password interaction: one accessible Show/Hide action toggles both password inputs and updates its accessible name.
8. Presentation: one desktop and one 375-pixel sub-check in the same test covering the named colors/panel/labels/focus plus one-column layout and no horizontal overflow. The form itself may be transparent inside the white panel. Starting at the form, walk through public ancestors toward body and accept a white background, restrained shadow, or orange top accent on any containing panel. Check colors qualitatively from computed RGB channels; do not use narrow regular expressions for particular RGB strings. For the orange primary action, read the submit button's backgroundColor; its foreground text is expected to remain readable rather than orange. For label position, derive the associated label from the input's \`labels\` collection so both wrapping labels and explicit \`for\` labels are supported.

Use robust locators in these probes. For the summary, prefer locator('[role="alert"]').filter({ hasText: /correct|problem|error|invalid|required/i }). Define the terms locator once as page.getByRole('checkbox', { name: /terms/i }) and reuse it everywhere rather than creating alternate anchored label locators. A field helper must set every supplied field to the requested state, including explicitly unchecking terms when false and clearing the optional date when omitted. Never let successful rows collide through reused identifiers. For stale errors, compare associated text before invalid submission, during the error, and after correction so permanent hints and stable empty error nodes are handled correctly.

Presentation:
- Use a full-width dark-blue header and a pale blue-gray page background.
- Center a white registration panel with a restrained shadow and a narrow orange top accent.
- Use orange for the primary action and place labels above their controls.
- Keyboard focus is clearly visible.
- At a 375-pixel viewport, related fields form one column and the page has no horizontal scrolling.

Cover every presentation family above at least once. Consolidate related desktop properties into one focused check and related narrow-viewport properties into another so broader state coverage does not make the suite slow.

Prefer accessible roles, labels, descriptions, and visible behavior. Use computed styles only for the presentation requirements above. Assert only the named presentation property, using broad qualitative checks rather than invented exact RGB values, pixel dimensions, container structure, or wording. Do not use screenshot or pixel-perfect comparison.`;

export function testAuthoringInstructions(scenario: CourseScenario): string {
  return scenario === "api"
    ? API_TEST_AUTHORING_INSTRUCTIONS
    : GUI_TEST_AUTHORING_INSTRUCTIONS;
}
