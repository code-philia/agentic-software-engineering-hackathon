import { expect, test, type Page } from "@playwright/test";

const pageUrl = process.env.COURSE_GUI_BASE_URL;
if (!pageUrl) throw new Error("COURSE_GUI_BASE_URL is required.");

async function openRegistration(page: Page): Promise<void> {
  await page.goto(pageUrl!);
}

async function fillValidRegistration(page: Page): Promise<void> {
  await page.getByLabel(/username/i).fill("rehearsal_user");
  await page.getByLabel(/email/i).fill("rehearsal@example.com");
  await page.getByLabel(/^password$/i).fill("CoursePassword9");
  await page.getByLabel(/confirm.*password/i).fill("CoursePassword9");
  await page.getByRole("checkbox", { name: /terms|agree|accept/i }).check();
}

test("exposes an accessible registration form", async ({ page }) => {
  await openRegistration(page);
  await expect(page.getByLabel(/username/i)).toBeVisible();
  await expect(page.getByLabel(/email/i)).toHaveAttribute("type", "email");
  await expect(page.getByLabel(/^password$/i)).toHaveAttribute("type", "password");
  await expect(page.getByLabel(/confirm.*password/i)).toHaveAttribute("type", "password");
  await expect(page.getByRole("button", { name: /register|create account|sign up|submit/i })).toBeVisible();
});

test("explains invalid input and allows password visibility to be changed", async ({ page }) => {
  await openRegistration(page);
  await fillValidRegistration(page);
  await page.getByLabel(/confirm.*password/i).fill("different password");
  await page.getByRole("button", { name: /register|create account|sign up|submit/i }).click();
  await expect(page.getByText(/passwords?.*(match|same)|(match|same).*passwords?/i)).toBeVisible();

  const visibilityControl = page
    .getByRole("checkbox", { name: /show.*password|hide.*password/i })
    .or(page.getByRole("button", { name: /show.*password|hide.*password/i }));
  await visibilityControl.click();
  await expect(page.getByLabel(/^password$/i)).toHaveAttribute("type", "text");
  await visibilityControl.click();
  await expect(page.getByLabel(/^password$/i)).toHaveAttribute("type", "password");
});

test("registers a user and rejects the same email after reload", async ({ page }) => {
  await openRegistration(page);
  await fillValidRegistration(page);
  await page.getByRole("button", { name: /register|create account|sign up|submit/i }).click();
  await expect(page.getByText(/success|registered|account.*created/i)).toBeVisible();

  await page.reload();
  await fillValidRegistration(page);
  await page.getByLabel(/username/i).fill("other_user");
  await page.getByRole("button", { name: /register|create account|sign up|submit/i }).click();
  await expect(page.getByText(/email.*(already|exists|registered|taken)|(already|duplicate).*email/i)).toBeVisible();
});
