import { expect, type Locator, type Page } from "@playwright/test";

export interface RegistrationValues {
  readonly username?: string;
  readonly email?: string;
  readonly dateOfBirth?: string;
  readonly password?: string;
  readonly confirmPassword?: string;
  readonly terms?: boolean;
}

function pageUrl(): string {
  const value = process.env.COURSE_GUI_BASE_URL;
  if (!value) throw new Error("COURSE_GUI_BASE_URL is required.");
  return value;
}

export function controls(page: Page) {
  const dateOfBirth = page.getByLabel(/date of birth/i);
  return {
    heading: page.getByRole("heading", {
      name: /register|create.*account|sign up/i,
    }),
    form: page.locator("form"),
    username: page.getByLabel(/^username/i),
    email: page.getByLabel(/email/i),
    dateOfBirth,
    dob: dateOfBirth,
    password: page.getByLabel(/^password(?!.*confirm)/i),
    confirmPassword: page
      .locator("input")
      .and(page.getByLabel(/confirm.*password|password.*confirm/i)),
    terms: page.getByRole("checkbox", { name: /terms/i }),
    submit: page.locator('button[type="submit"]'),
    passwordToggle: page
      .getByRole("button", {
        name: /^(?:show|hide|reveal)(?: all)? passwords?$/i,
      })
      .or(
        page.getByRole("checkbox", {
          name: /^(?:show|hide|reveal)(?: all)? passwords?$/i,
        }),
      ),
  };
}

export async function openRegistration(page: Page): Promise<void> {
  await page.goto(pageUrl());
}

export async function resetRegistration(page: Page): Promise<void> {
  await openRegistration(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

export async function fillRegistration(
  page: Page,
  values: RegistrationValues = {},
): Promise<void> {
  const fields = controls(page);
  const password = values.password ?? "Password01";
  await fields.username.fill(values.username ?? "Valid_User1");
  await fields.email.fill(values.email ?? "valid.user1@example.com");
  await fields.dateOfBirth.fill(values.dateOfBirth ?? "");
  await fields.password.fill(password);
  await fields.confirmPassword.fill(values.confirmPassword ?? password);
  if (values.terms ?? true) await fields.terms.check();
  else await fields.terms.uncheck();
}

export async function submitRegistration(page: Page): Promise<void> {
  await controls(page).submit.click();
}

export function successFeedback(page: Page): Locator {
  return page
    .locator('[role="status"], [role="alert"], [aria-live]')
    .filter({ hasText: /success|account.{0,30}created|welcome/i })
    .last();
}

export function errorSummary(page: Page): Locator {
  return page
    .locator('[role="alert"]')
    .filter({
      hasText:
        /correct|problem|error|invalid|required|already\s+(?:registered|exists)|duplicate|taken/i,
    })
    .first();
}

export async function expectFieldError(
  page: Page,
  field: keyof ReturnType<typeof controls> | Locator,
  pattern: RegExp = /.+/,
): Promise<void> {
  const control = typeof field === "string" ? controls(page)[field] : field;
  const describedBy = await control.getAttribute("aria-describedby");
  expect(
    describedBy,
    "the field must identify its error with aria-describedby",
  ).toBeTruthy();
  const messages = await Promise.all(
    (describedBy ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => page.locator(`[id=${JSON.stringify(id)}]`).textContent()),
  );
  expect(messages.filter(Boolean).join(" ")).toMatch(pattern);
}

export async function expectFirstInvalid(
  page: Page,
  field: keyof ReturnType<typeof controls> | Locator = "username",
): Promise<void> {
  const control = typeof field === "string" ? controls(page)[field] : field;
  await expect(control).toBeFocused();
}

export async function expectRejection(page: Page): Promise<void> {
  await expect(errorSummary(page)).toBeVisible();
  await expect(successFeedback(page)).toBeHidden();
}

export async function storageCorpus(
  page: Page,
): Promise<Record<string, string>> {
  return page.evaluate(() => {
    const stored: Record<string, string> = {};
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key) stored[key] = localStorage.getItem(key) ?? "";
    }
    return stored;
  });
}
