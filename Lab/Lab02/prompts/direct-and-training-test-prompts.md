# API 与 GUI 的八段生成提示词

> **阅读方式：** `{{...}}` 是运行时占位符；紧跟其后的圆括号是为了课堂展示而添加的解释，**不会发送给模型**。`[… truncated …]` 表示完整内容在截图展示时有所省略。

# API 场景

## 1. API Direct — SYSTEM PROMPT

```text
SYSTEM_PROMPT=

Create the complete implementation described by the public task.

Use write_file to save the complete artifact to {{AUTHORIZED_IMPLEMENTATION_PATH}}.
（展示注释：<workspace-root>/direct/register.ts）

You may write only that file. Do not merely print the source as your final answer.

Follow this execution contract exactly.

{{IMPLEMENTATION_CONTRACT}}
（展示注释：
  "Produce the complete contents of one TypeScript file named register.ts.
   Default-export a handler based on the standard Request and Response APIs.
   The teacher-owned HTTP adapter calls it for POST /api/register.
   Read username, email, optional dateOfBirth, password, and confirmPassword.
   Return the documented 201, 400, and 409 JSON response shapes.
   Keep registration state in memory and use only built-in JavaScript and Web APIs.
   Write only the complete TypeScript source with write_file.
   [… truncated …]"）
```

---

## 2. API Direct — USER PROMPT

```text
USER_PROMPT=

Registration task:

{{PUBLIC_BRIEF}}
（展示注释：
  "Build an API that lets someone create an account using a username, email
   address, password, password confirmation, and an optional date of birth.

   Validate the submitted information using sensible conventions for a modern
   registration service. Reject malformed or unusable details, prevent duplicate
   accounts, and normalize identity values where appropriate.

   A rejected attempt must not create or reserve an account. A successful
   registration returns the user's public account details and a new session token
   without exposing passwords or other sensitive information."）
```

---

## 3. API Training Test — SYSTEM PROMPT

```text
SYSTEM_PROMPT=

Create a complete executable train-test suite for the registration task.

Think carefully about normalization, boundary conditions, malformed input, failed
state transitions, duplicate handling, accessibility, persistence, and
sensitive-data safety where applicable. Every test must make a meaningful
externally observable assertion.

{{TEST_AUTHORING_INSTRUCTIONS}}
（展示注释：
  "Treat the registration policy as authoritative when choosing test behavior.
   Test trimmed usernames of 3–20 characters with the documented character rules;
   normalized, structurally valid email addresses; passwords of 10–64 characters
   containing a letter and digit; exact password confirmation; and optional real
   Gregorian dates in YYYY-MM-DD form.

   Use deterministic, simultaneously valid fixtures. Cover normalization,
   boundaries, malformed input, duplicate handling, state transitions, response
   shape, distinct session tokens, and sensitive-data safety. Invalid attempts
   reserve nothing, and error responses never echo password values.
   [… truncated …]"）

Use write_file to save the complete artifact to {{AUTHORIZED_TEST_PATH}}.
（展示注释：<workspace-root>/train/register.test.ts）

You may write only that file. Do not merely print the source as your final answer.

Follow this execution contract exactly.

{{TRAIN_TEST_CONTRACT}}
（展示注释：
  "Produce one executable Vitest file named register.test.ts. The runner starts a
   fresh API server and supplies process.env.COURSE_API_BASE_URL. Exercise only
   POST /api/register through built-in fetch.

   Do not inspect the implementation, reference implementation, validation suite,
   repository files, working directory, or run artifacts. Do not read or write
   files, start processes, dynamically load modules, or use external services.
   Tests must create their own state, avoid order dependence, and make meaningful
   assertions. Write only the complete TypeScript test source with write_file.
   [… truncated …]"）
```

---

## 4. API Training Test — USER PROMPT

```text
USER_PROMPT=

Registration task:

{{PUBLIC_BRIEF}}
（展示注释：Training Test 不会收到 Direct 生成的代码，只接收以下公开需求：

  "Build an API that lets someone create an account using a username, email
   address, password, password confirmation, and an optional date of birth.

   Validate the submitted information using sensible conventions for a modern
   registration service. Reject malformed or unusable details, prevent duplicate
   accounts, and normalize identity values where appropriate.

   A rejected attempt must not create or reserve an account. A successful
   registration returns the user's public account details and a new session token
   without exposing passwords or other sensitive information."）
```

# GUI 场景

## 5. GUI Direct — SYSTEM PROMPT

```text
SYSTEM_PROMPT=

Create the complete implementation described by the public task.

Use write_file to save the complete artifact to {{AUTHORIZED_IMPLEMENTATION_PATH}}.
（展示注释：<workspace-root>/direct/index.html）

You may write only that file. Do not merely print the source as your final answer.

Follow this execution contract exactly.

{{IMPLEMENTATION_CONTRACT}}
（展示注释：
  "Produce the complete contents of one self-contained index.html with inline CSS
   and browser JavaScript. Do not use packages, build tools, a backend, or external
   network resources. Keep the file compact enough for one model tool call.

   Use semantic HTML, accessible English labels, suitable input types, and useful
   autocomplete attributes. Implement the behavior and presentation in the task.
   Choose sensible modern conventions where details are intentionally open. Use
   browser storage when reload persistence is needed, do not store secrets, and do
   not attempt to anticipate instructor-only validation details.
   Write only the complete HTML source with write_file.
   [… truncated …]"）
```

---

## 6. GUI Direct — USER PROMPT

```text
USER_PROMPT=

Registration task:

{{PUBLIC_BRIEF}}
（展示注释：
  "Create an accessible registration page where someone can enter a username,
   email address, optional date of birth, password, and password confirmation,
   accept the terms of service, and submit the form.

   Validate the information using sensible conventions for a modern registration
   service. Help the user understand and correct invalid input. Prevent duplicate
   registrations across page reloads without saving passwords.

   Let users reveal the password values while typing and hide them again. Use a
   trustworthy public-service visual style: a full-width dark navy-blue service
   header with a restrained orange accent, a pale blue-gray page background, and
   a centered white registration panel with an orange primary submit action. On
   typical desktop screens, place related fields in two columns where space
   permits; collapse them to one column on narrow mobile screens without
   horizontal scrolling. Keep the page clear, keyboard accessible, responsive,
   and comfortable to use."）
```

---

## 7. GUI Training Test — SYSTEM PROMPT

```text
SYSTEM_PROMPT=

Create a complete executable train-test suite for the registration task.

Think carefully about normalization, boundary conditions, malformed input, failed
state transitions, duplicate handling, accessibility, persistence, and
sensitive-data safety where applicable. Every test must make a meaningful
externally observable assertion.

{{TEST_AUTHORING_INSTRUCTIONS}}
（展示注释：
  "Apply the documented username, email, password, confirmation, optional date,
   normalization, boundary, duplicate, and deterministic-fixture policies through
   browser-observable behavior.

   Produce exactly eight compact, grouped scenarios (at most 320 lines) covering:
   accessibility plus all-errors submission; stale-error recovery; data-driven
   field policy; normalization and safe persistence; duplicate atomicity; multiple
   accounts; password reveal/hide; and qualitative desktop/mobile presentation.
   Write the complete suite once rather than drafting or rewriting it across turns.

   Check the named presentation requirements qualitatively, including responsive
   behavior at a 375-pixel viewport. Keep the Playwright suite compact enough to
   finish comfortably within 60 seconds using one worker. Do not use screenshot or
   pixel-perfect comparison or assert invented implementation details.
   [… truncated …]"）

Use write_file to save the complete artifact to {{AUTHORIZED_TEST_PATH}}.
（展示注释：<workspace-root>/train/register.spec.ts）

You may write only that file. Do not merely print the source as your final answer.

Follow this execution contract exactly.

{{TRAIN_TEST_CONTRACT}}
（展示注释：
  "Produce one executable Playwright file named register.spec.ts. The runner
   supplies process.env.COURSE_GUI_BASE_URL. Import test and expect from
   @playwright/test and treat the public browser page as the only test seam.

   Do not inspect generated HTML, reference implementation, validation material,
   repository files, or run artifacts. Exercise the page through accessible roles,
   labels, descriptions, and visible text. Use isolated state and documented
   matchers. Avoid exact wording, DOM hierarchy, internal CSS selectors, screenshots,
   and pixel comparison. Finish within 60 seconds and write only the complete test
   source with write_file.
   [… truncated …]"）
```

---

## 8. GUI Training Test — USER PROMPT

```text
USER_PROMPT=

Registration task:

{{PUBLIC_BRIEF}}
（展示注释：Training Test 不会收到 Direct 生成的代码，只接收以下公开需求：

  "Create an accessible registration page where someone can enter a username,
   email address, optional date of birth, password, and password confirmation,
   accept the terms of service, and submit the form.

   Validate the information using sensible conventions for a modern registration
   service. Help the user understand and correct invalid input. Prevent duplicate
   registrations across page reloads without saving passwords.

   Let users reveal the password values while typing and hide them again. Use a
   trustworthy public-service visual style: a full-width dark navy-blue service
   header with a restrained orange accent, a pale blue-gray page background, and
   a centered white registration panel with an orange primary submit action. On
   typical desktop screens, place related fields in two columns where space
   permits; collapse them to one column on narrow mobile screens without
   horizontal scrolling. Keep the page clear, keyboard accessible, responsive,
   and comfortable to use."）
```

---

> **核心关系：** API 与 GUI 各自包含 Direct 和 Training Test 两个模型环节，每个环节都有独立的 System Prompt 与 User Prompt。Direct 只接收公开需求和实现契约；Training Test 接收相同的公开需求，以及测试专用规则和测试执行契约，但不会接收 Direct 生成的代码。
