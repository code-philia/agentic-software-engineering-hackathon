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

test('accessible structure and heading', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await expect(c.heading).toBeVisible();
  const text = await c.heading.textContent();
  expect(text).toMatch(/register|create.*account|sign up/i);
  await expect(c.form).toBeVisible();
  await expect(c.username).toBeVisible();
  await expect(c.email).toBeVisible();
  await expect(c.password).toBeVisible();
  await expect(c.confirmPassword).toBeVisible();
  await expect(c.terms).toBeVisible();
  await expect(c.submit).toBeVisible();
});

test('empty submission reports all required problems and focuses first invalid', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await c.submit.click();
  await expectFieldError(page, 'username');
  await expectFieldError(page, 'email');
  await expectFieldError(page, 'password');
  await expectFieldError(page, 'confirmPassword');
  await expectFieldError(page, 'terms');
  await expect(errorSummary(page)).toBeVisible();
  await expectFirstInvalid(page, 'username');
});

test('valid submission succeeds and clears stale errors', async ({ page }) => {
  await resetRegistration(page);
  const data = uniqueRegistration();
  await fillRegistration(page, data);
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
  await expect(errorSummary(page)).not.toBeVisible();
});

test('field validation boundaries', async ({ page }) => {
  await resetRegistration(page);
  const base = uniqueRegistration();

  const usernameCases = [
    { value: 'Ab', valid: false },
    { value: 'Ab3', valid: true },
    { value: '  Ab3  ', valid: true, trimmed: 'Ab3' },
    { value: '1abc', valid: false },
    { value: 'a'.repeat(21), valid: false },
    { value: 'a_b-c', valid: false },
  ];

  for (const row of usernameCases) {
    await resetRegistration(page);
    const u = uniqueRegistration();
    const payload: any = { ...base, username: row.value, email: u.email };
    if (!row.valid) {
      await fillRegistration(page, payload);
      await submitRegistration(page);
      await expectFieldError(page, 'username');
      await expectRejection(page);
    } else {
      await fillRegistration(page, payload);
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
      if (row.trimmed) {
        const stored = await storageCorpus(page);
        const corpus = Object.values(stored).join(' ');
        expect(corpus).toContain(row.trimmed);
      }
    }
  }

  const emailCases = [
    { value: 'user@example.com', valid: true },
    { value: 'User@Example.Com', valid: true, normalized: 'user@example.com' },
    { value: ' user@example.com ', valid: true, normalized: 'user@example.com' },
    { value: 'u@a.b', valid: true },
    { value: '@example.com', valid: false },
    { value: 'user@', valid: false },
    { value: 'user@.com', valid: false },
    { value: 'user@example..com', valid: false },
    { value: '.user@example.com', valid: false },
    { value: 'user.@example.com', valid: false },
    { value: 'user@-example.com', valid: false },
    { value: 'user@example-.com', valid: false },
    { value: 'user example.com', valid: false },
  ];

  for (const row of emailCases) {
    await resetRegistration(page);
    const u = uniqueRegistration();
    const payload: any = { ...base, username: u.username, email: row.value };
    if (!row.valid) {
      await fillRegistration(page, payload);
      await submitRegistration(page);
      await expectFieldError(page, 'email');
      await expectRejection(page);
    } else {
      await fillRegistration(page, payload);
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
      if (row.normalized) {
        const stored = await storageCorpus(page);
        const corpus = Object.values(stored).join(' ');
        expect(corpus).toContain(row.normalized);
      }
    }
  }

  const passwordCases = [
    { pw: 'Abcdefgh1', valid: false, field: 'password' },
    { pw: 'Password01', valid: true },
    { pw: 'abcdefghij', valid: false, field: 'password' },
    { pw: '1234567890', valid: false, field: 'password' },
    { pw: 'A1' + 'x'.repeat(62), valid: true },
    { pw: 'A1' + 'x'.repeat(63), valid: false, field: 'password' },
  ];

  for (const row of passwordCases) {
    await resetRegistration(page);
    const u = uniqueRegistration();
    const payload: any = { ...base, username: u.username, email: u.email, password: row.pw, confirmPassword: row.pw };
    if (!row.valid) {
      await fillRegistration(page, payload);
      await submitRegistration(page);
      await expectFieldError(page, row.field || 'password');
      await expectRejection(page);
    } else {
      await fillRegistration(page, payload);
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
    }
  }

  await resetRegistration(page);
  const u1 = uniqueRegistration();
  await fillRegistration(page, { ...base, username: u1.username, email: u1.email, password: 'Password01', confirmPassword: 'Password02' });
  await submitRegistration(page);
  await expectFieldError(page, 'confirmPassword');
  await expectRejection(page);

  await resetRegistration(page);
  await fillRegistration(page, { ...base, terms: false });
  await submitRegistration(page);
  await expectFieldError(page, 'terms');
  await expectRejection(page);
});

test('show/hide password toggles both inputs', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const data = uniqueRegistration();
  await fillRegistration(page, data);
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
});

test('persistence: whitespace trimming, lowercase email, duplicate checks, no passwords', async ({ page }) => {
  await resetRegistration(page);
  const rawUsername = '  TestUser_1  ';
  const rawEmail = '  Test.User_1@Example.COM  ';
  const password = 'Password01';
  await fillRegistration(page, { username: rawUsername, email: rawEmail, password, confirmPassword: password });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  const stored1 = await storageCorpus(page);
  const corpus1 = Object.values(stored1).join(' ');
  expect(corpus1).toContain('TestUser_1');
  expect(corpus1).toContain('test.user_1@example.com');
  expect(corpus1).not.toContain(password);
  const keys1 = Object.keys(stored1);
  for (const k of keys1) {
    expect(k.toLowerCase()).not.toContain('password');
  }

  await page.reload();
  await fillRegistration(page, { username: 'testuser_1', email: 'other@example.com', password, confirmPassword: password });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'username');

  await fillRegistration(page, { username: 'AnotherUser', email: 'test.user_1@example.com', password, confirmPassword: password });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'email');

  await fillRegistration(page, { username: 'RejectUser', email: 'reject@example.com', password: 'short', confirmPassword: 'short' });
  await submitRegistration(page);
  await expectRejection(page);

  await fillRegistration(page, { username: 'RejectUser', email: 'reject@example.com', password, confirmPassword: password });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('optional date of birth', async ({ page }) => {
  await resetRegistration(page);
  const data = uniqueRegistration();
  await fillRegistration(page, { ...data, dateOfBirth: '' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await resetRegistration(page);
  await fillRegistration(page, { ...data, dateOfBirth: '2000-02-29' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('presentation and responsive layout', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);

  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  const headerBg = await header.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const headerRgb = headerBg.match(/\d+/g)?.map(Number) || [];
  expect(headerRgb.length).toBeGreaterThanOrEqual(3);
  expect(headerRgb[0]).toBeLessThan(100);
  expect(headerRgb[1]).toBeLessThan(100);
  expect(headerRgb[2]).toBeLessThan(150);

  const bodyBg = await page.evaluate(() => window.getComputedStyle(document.body).backgroundColor);
  const bodyRgb = bodyBg.match(/\d+/g)?.map(Number) || [];
  expect(bodyRgb.length).toBeGreaterThanOrEqual(3);
  expect(bodyRgb[0]).toBeGreaterThan(bodyRgb[2]);
  expect(bodyRgb[1]).toBeGreaterThan(bodyRgb[2]);

  const formBox = await c.form.boundingBox();
  expect(formBox).toBeTruthy();
  const viewport = await page.viewportSize();
  if (viewport) {
    expect(formBox!.x).toBeGreaterThan(0);
    expect(formBox!.x + formBox!.width).toBeLessThan(viewport.width);
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(c.form).toBeVisible();
  const formWidth = await c.form.evaluate((el) => el.offsetWidth);
  const viewWidth = await page.evaluate(() => window.innerWidth);
  expect(formWidth).toBeLessThanOrEqual(viewWidth);
  await expect(page.locator('html')).not.toHaveCSS('overflow-x', /auto|scroll/);

  await page.setViewportSize({ width: 1280, height: 800 });
  const submitBg = await c.submit.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const submitRgb = submitBg.match(/\d+/g)?.map(Number) || [];
  expect(submitRgb.length).toBeGreaterThanOrEqual(3);
  expect(submitRgb[0]).toBeGreaterThan(submitRgb[1]);
  expect(submitRgb[0]).toBeGreaterThan(submitRgb[2]);

  await c.username.focus();
  const focusOutline = await c.username.evaluate((el) => window.getComputedStyle(el).outlineStyle);
  expect(focusOutline).not.toBe('none');
});
