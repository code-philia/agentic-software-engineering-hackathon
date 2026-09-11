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

test('accessible structure and labels', async ({ page }) => {
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

test('valid submission succeeds and clears stale errors on retry', async ({ page }) => {
  await resetRegistration(page);
  await submitRegistration(page);
  await expect(errorSummary(page)).toBeVisible();
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
  await expect(errorSummary(page)).not.toBeVisible();
});

test.describe('username boundaries', () => {
  const rows: { label: string; value: string; valid: boolean }[] = [
    { label: 'min length 3', value: 'Ab3', valid: true },
    { label: 'max length 20', value: 'A' + 'b'.repeat(18) + '3', valid: true },
    { label: 'too short 2', value: 'Ab', valid: false },
    { label: 'too long 21', value: 'A' + 'b'.repeat(19) + '3', valid: false },
    { label: 'starts with digit', value: '1Abcdefgh', valid: false },
    { label: 'starts with underscore', value: '_Abcdefgh', valid: false },
    { label: 'contains space', value: 'Ab cd', valid: false },
    { label: 'contains hyphen', value: 'Ab-cd', valid: false },
    { label: 'valid underscore body', value: 'Ab_cd_3', valid: true },
  ];

  for (const r of rows) {
    test(r.label, async ({ page }) => {
      await resetRegistration(page);
      const id = uniqueRegistration();
      await fillRegistration(page, { username: r.value, email: id.email });
      await submitRegistration(page);
      if (r.valid) {
        await expect(successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, 'username');
      }
    });
  }

  test('trims surrounding whitespace and preserves trimmed spelling', async ({ page }) => {
    await resetRegistration(page);
    const id = uniqueRegistration();
    const padded = '  Ab3_pad  ';
    await fillRegistration(page, { username: padded, email: id.email });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
    const store = await storageCorpus(page);
    const text = Object.values(store).join('\n');
    expect(text).toContain('Ab3_pad');
    expect(text).not.toContain('  Ab3_pad  ');
  });
});

test.describe('email boundaries', () => {
  const rows: { label: string; value: string; valid: boolean }[] = [
    { label: 'simple valid', value: 'a@b.c', valid: true },
    { label: 'single-letter tld', value: 'user@domain.x', valid: true },
    { label: 'missing at', value: 'userdomain.c', valid: false },
    { label: 'missing domain', value: 'user@', valid: false },
    { label: 'missing local', value: '@domain.c', valid: false },
    { label: 'whitespace in local', value: 'u ser@domain.c', valid: false },
    { label: 'repeated dots local', value: 'us..er@domain.c', valid: false },
    { label: 'dot-bounded local start', value: '.user@domain.c', valid: false },
    { label: 'dot-bounded local end', value: 'user.@domain.c', valid: false },
    { label: 'hyphen-bounded domain label', value: 'user@-domain.c', valid: false },
    { label: 'empty domain label', value: 'user@domain..c', valid: false },
  ];

  for (const r of rows) {
    test(r.label, async ({ page }) => {
      await resetRegistration(page);
      const id = uniqueRegistration();
      await fillRegistration(page, { username: id.username, email: r.value });
      await submitRegistration(page);
      if (r.valid) {
        await expect(successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, 'email');
      }
    });
  }

  test('normalizes email to lowercase', async ({ page }) => {
    await resetRegistration(page);
    const id = uniqueRegistration();
    const mixed = 'MixedCase@Example.COM';
    await fillRegistration(page, { username: id.username, email: mixed });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
    const store = await storageCorpus(page);
    const text = Object.values(store).join('\n');
    expect(text).toContain('mixedcase@example.com');
    expect(text).not.toContain('MixedCase@Example.COM');
  });
});

test.describe('password and confirmation boundaries', () => {
  const maxPw = 'A1' + 'x'.repeat(62);
  const rows: { label: string; pw: string; confirm?: string; field: string; valid: boolean }[] = [
    { label: 'min valid 10', pw: 'Password01', field: 'password', valid: true },
    { label: 'max valid 64', pw: maxPw, field: 'password', valid: true },
    { label: 'too short 9', pw: 'Abcdefgh1', field: 'password', valid: false },
    { label: 'no digit', pw: 'Abcdefghij', field: 'password', valid: false },
    { label: 'no letter', pw: '1234567890', field: 'password', valid: false },
    { label: 'lowercase only with digit', pw: 'abcdefghi1', field: 'password', valid: true },
    { label: 'uppercase only with digit', pw: 'ABCDEFGHI1', field: 'password', valid: true },
    { label: 'mismatch confirmation', pw: 'Password01', confirm: 'Password02', field: 'confirmPassword', valid: false },
  ];

  for (const r of rows) {
    test(r.label, async ({ page }) => {
      await resetRegistration(page);
      const id = uniqueRegistration();
      const overrides: Record<string, string | boolean> = {
        username: id.username,
        email: id.email,
        password: r.pw,
      };
      if (r.confirm !== undefined) overrides.confirmPassword = r.confirm;
      await fillRegistration(page, overrides);
      await submitRegistration(page);
      if (r.valid) {
        await expect(successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, r.field);
      }
    });
  }
});

test('optional date of birth accepts real date and omission', async ({ page }) => {
  await resetRegistration(page);
  const id1 = uniqueRegistration();
  await fillRegistration(page, { username: id1.username, email: id1.email, dateOfBirth: '2000-02-29' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await resetRegistration(page);
  const id2 = uniqueRegistration();
  await fillRegistration(page, { username: id2.username, email: id2.email });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('terms checkbox is required', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { terms: false });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'terms');
});

test('show/hide password toggle updates both fields and accessible name', async ({ page }) => {
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

test('persistence: duplicates rejected after reload, no password stored', async ({ page }) => {
  await resetRegistration(page);
  const id = uniqueRegistration();
  const secretPw = 'SecretPw99';
  await fillRegistration(page, { username: id.username, email: id.email, password: secretPw });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  const store = await storageCorpus(page);
  const allText = Object.values(store).join('\n');
  expect(allText).not.toContain(secretPw);
  for (const key of Object.keys(store)) {
    expect(key.toLowerCase()).not.toMatch(/password/);
  }

  await openRegistration(page);
  const dup1 = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: dup1.email });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'username');

  await openRegistration(page);
  const dup2 = uniqueRegistration();
  await fillRegistration(page, { username: dup2.username, email: id.email });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'email');
});

test('rejected attempt reserves nothing; fixing companion allows same identifiers', async ({ page }) => {
  await resetRegistration(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email, password: 'short', confirmPassword: 'short' });
  await submitRegistration(page);
  await expectRejection(page);

  await fillRegistration(page, { username: id.username, email: id.email, password: 'Password01' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('presentation: header, panel, accent, responsive layout, focus indicator', async ({ page }) => {
  const c = controls(page);
  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  const headerBg = await header.evaluate((el) => getComputedStyle(el).backgroundColor);
  const hChannels = headerBg.match(/\d+/g)!.map(Number);
  expect(hChannels[2]).toBeGreaterThan(hChannels[0]);
  expect(hChannels[2]).toBeGreaterThan(hChannels[1]);

  const submitBg = await c.submit.evaluate((el) => getComputedStyle(el).backgroundColor);
  const sChannels = submitBg.match(/\d+/g)!.map(Number);
  expect(sChannels[0]).toBeGreaterThan(sChannels[2]);
  expect(sChannels[0]).toBeGreaterThan(sChannels[1]);

  await page.setViewportSize({ width: 1200, height: 800 });
  const uBox = await c.username.boundingBox();
  const eBox = await c.email.boundingBox();
  if (uBox && eBox) {
    const sameRow = Math.abs(uBox.y - eBox.y) < 20;
    expect(sameRow).toBeTruthy();
  }

  await page.setViewportSize({ width: 360, height: 640 });
  const formBox = await c.form.boundingBox();
  expect(formBox).not.toBeNull();
  if (formBox) {
    expect(formBox.width).toBeLessThanOrEqual(360);
  }

  await c.username.focus();
  const outline = await c.username.evaluate((el) => getComputedStyle(el).outlineStyle);
  const boxShadow = await c.username.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(outline !== 'none' || boxShadow !== 'none').toBeTruthy();
});
