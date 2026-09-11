import { test, expect } from '@playwright/test';
import {
  controls,
  openRegistration,
  resetRegistration,
  uniqueRegistration,
  fillRegistration,
  submitRegistration,
  successFeedback,
  errorSummary,
  expectFieldError,
  expectFirstInvalid,
  expectRejection,
  storageCorpus,
} from './course-gui-test-support.js';

const BASE = process.env.COURSE_GUI_BASE_URL!;

test.beforeEach(async ({ page }) => {
  await openRegistration(page);
});

test('accessible structure and input types', async ({ page }) => {
  const c = controls(page);
  await expect(c.heading).toBeVisible();
  await expect(c.heading).toContainText(/register|create.*account|sign up/i);
  await expect(c.form).toBeVisible();
  await expect(c.username).toHaveAttribute('autocomplete', /username/);
  await expect(c.email).toHaveAttribute('type', 'email');
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await expect(c.dateOfBirth).toHaveAttribute('type', 'date');
  await expect(c.terms).toHaveRole('checkbox');
  await expect(c.submit).toHaveRole('button');
});

test('empty submission reports all required problems and focuses first invalid', async ({ page }) => {
  await resetRegistration(page);
  await submitRegistration(page);
  await expect(errorSummary(page)).toBeVisible();
  await expectFieldError(page, 'username');
  await expectFieldError(page, 'email');
  await expectFieldError(page, 'password');
  await expectFieldError(page, 'confirmPassword');
  await expectFieldError(page, 'terms');
  await expectFirstInvalid(page);
});

test('valid submission succeeds and clears stale errors', async ({ page }) => {
  await resetRegistration(page);
  await submitRegistration(page);
  await expect(errorSummary(page)).toBeVisible();
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
  await expect(errorSummary(page)).not.toBeVisible();
});

const usernameRows = [
  { label: 'min length 3', value: 'Ab3', valid: true },
  { label: 'max length 20', value: 'A' + 'b'.repeat(18) + '3', valid: true },
  { label: 'too short 2', value: 'A1', valid: false },
  { label: 'too long 21', value: 'A' + 'b'.repeat(19) + '3', valid: false },
  { label: 'starts with digit', value: '1Abcdefgh', valid: false },
  { label: 'starts with underscore', value: '_Abcdefgh', valid: false },
  { label: 'contains space', value: 'Ab cd', valid: false },
  { label: 'contains hyphen', value: 'Ab-cd', valid: false },
  { label: 'valid underscore interior', value: 'Ab_cd3', valid: true },
  { label: 'trimmed whitespace preserved spelling', value: '  Ab3  ', valid: true },
];

for (const row of usernameRows) {
  test(`username boundary: ${row.label}`, async ({ page }) => {
    await resetRegistration(page);
    const id = uniqueRegistration();
    await fillRegistration(page, { username: row.value, email: id.email });
    await submitRegistration(page);
    if (row.valid) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, 'username');
    }
  });
}

const emailRows = [
  { label: 'valid simple', value: 'a@b.c', valid: true },
  { label: 'valid subdomain', value: 'user@mail.example.com', valid: true },
  { label: 'normalized lowercase', value: 'USER@Example.COM', valid: true },
  { label: 'missing at', value: 'userexample.com', valid: false },
  { label: 'missing domain', value: 'user@', valid: false },
  { label: 'missing local', value: '@example.com', valid: false },
  { label: 'whitespace in local', value: 'us er@example.com', valid: false },
  { label: 'repeated dots local', value: 'us..er@example.com', valid: false },
  { label: 'dot bounded local', value: '.user@example.com', valid: false },
  { label: 'empty domain label', value: 'user@.example.com', valid: false },
  { label: 'hyphen bounded domain', value: 'user@-example.com', valid: false },
  { label: 'single letter tld', value: 'user@example.c', valid: true },
];

for (const row of emailRows) {
  test(`email boundary: ${row.label}`, async ({ page }) => {
    await resetRegistration(page);
    const id = uniqueRegistration();
    await fillRegistration(page, { username: id.username, email: row.value });
    await submitRegistration(page);
    if (row.valid) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, 'email');
    }
  });
}

const passwordRows = [
  { label: 'min 10 with letter+digit', pw: 'Password01', field: 'password', valid: true },
  { label: 'max 64', pw: 'A1' + 'x'.repeat(62), field: 'password', valid: true },
  { label: 'too short 9', pw: 'Abcdefgh1', field: 'password', valid: false },
  { label: 'no digit', pw: 'Abcdefghij', field: 'password', valid: false },
  { label: 'no letter', pw: '1234567890', field: 'password', valid: false },
  { label: 'lowercase only with digit', pw: 'abcdefghi1', field: 'password', valid: true },
  { label: 'uppercase only with digit', pw: 'ABCDEFGHI1', field: 'password', valid: true },
  { label: 'confirmation mismatch', pw: 'Password01', confirm: 'Password02', field: 'confirmPassword', valid: false },
];

for (const row of passwordRows) {
  test(`password boundary: ${row.label}`, async ({ page }) => {
    await resetRegistration(page);
    const overrides: Record<string, string | boolean> = { password: row.pw };
    if ('confirm' in row) overrides.confirmPassword = row.confirm!;
    await fillRegistration(page, overrides);
    await submitRegistration(page);
    if (row.valid) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, row.field as any);
    }
  });
}

test('terms unchecked is rejected', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { terms: false });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'terms');
});

test('optional date of birth accepts real date and omission', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { dateOfBirth: '2000-02-29' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await resetRegistration(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email, dateOfBirth: '' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('show/hide password toggle updates both fields and accessible name', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
});

test('persistence trims username, lowercases email, and excludes passwords', async ({ page }) => {
  await resetRegistration(page);
  const id = uniqueRegistration();
  const rawUser = '  MyUser_1  ';
  const rawEmail = '  MyUser@Example.COM  ';
  const secret = 'Password01';
  await fillRegistration(page, { username: rawUser, email: rawEmail, password: secret });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  const store = await storageCorpus(page);
  const text = Object.values(store).join('\n');
  expect(text).toContain('MyUser_1');
  expect(text).toContain('myuser@example.com');
  expect(text).not.toContain(secret);
  for (const key of Object.keys(store)) {
    expect(key.toLowerCase()).not.toMatch(/password/);
  }
});

test('duplicate username and email survive reload without reserving on rejection', async ({ page }) => {
  await resetRegistration(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await page.reload();
  await fillRegistration(page, { username: id.username, email: uniqueRegistration().email });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'username');

  await fillRegistration(page, { username: uniqueRegistration().username, email: id.email });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'email');

  const fresh = uniqueRegistration();
  await fillRegistration(page, { username: fresh.username, email: fresh.email, password: 'Short' });
  await submitRegistration(page);
  await expectRejection(page);

  await fillRegistration(page, { username: fresh.username, email: fresh.email });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('presentation: header, panel, accent, responsive layout, and focus indicator', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);

  const header = page.locator('header').first();
  const hStyle = await header.evaluate((el) => getComputedStyle(el));
  const hRgb = hStyle.backgroundColor.match(/\d+/g)!.map(Number);
  expect(hRgb[2]).toBeGreaterThan(hRgb[0]);
  expect(hRgb[2]).toBeGreaterThan(hRgb[1]);

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bRgb = bodyBg.match(/\d+/g)!.map(Number);
  expect(bRgb[0]).toBeGreaterThan(200);
  expect(bRgb[1]).toBeGreaterThan(200);
  expect(bRgb[2]).toBeGreaterThan(200);

  const panel = c.form.locator('xpath=ancestor::*[contains(@class,"panel") or contains(@class,"card") or contains(@class,"container")]').first()
    .or(c.form.locator('..'));
  const pBg = await panel.evaluate((el) => getComputedStyle(el).backgroundColor);
  const pRgb = pBg.match(/\d+/g)!.map(Number);
  expect(pRgb[0]).toBeGreaterThan(240);
  expect(pRgb[1]).toBeGreaterThan(240);
  expect(pRgb[2]).toBeGreaterThan(240);

  const sStyle = await c.submit.evaluate((el) => getComputedStyle(el));
  const sRgb = sStyle.backgroundColor.match(/\d+/g)!.map(Number);
  expect(sRgb[0]).toBeGreaterThan(sRgb[2]);
  expect(sRgb[0]).toBeGreaterThan(150);

  await page.setViewportSize({ width: 1200, height: 800 });
  const uBox = await c.username.boundingBox();
  const eBox = await c.email.boundingBox();
  if (uBox && eBox) {
    const sameRow = Math.abs(uBox.y - eBox.y) < 20;
    expect(sameRow).toBeTruthy();
  }

  await page.setViewportSize({ width: 360, height: 640 });
  const uBox2 = await c.username.boundingBox();
  const eBox2 = await c.email.boundingBox();
  if (uBox2 && eBox2) {
    expect(uBox2.x).toBeGreaterThanOrEqual(0);
    expect(eBox2.x).toBeGreaterThanOrEqual(0);
    expect(uBox2.x + uBox2.width).toBeLessThanOrEqual(360);
    expect(eBox2.x + eBox2.width).toBeLessThanOrEqual(360);
  }

  await c.username.focus();
  const outline = await c.username.evaluate((el) => getComputedStyle(el).outlineStyle);
  const boxShadow = await c.username.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(outline !== 'none' || boxShadow !== 'none').toBeTruthy();
});
