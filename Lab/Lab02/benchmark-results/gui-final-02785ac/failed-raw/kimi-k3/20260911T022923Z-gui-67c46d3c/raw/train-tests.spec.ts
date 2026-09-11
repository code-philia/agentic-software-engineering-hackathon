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

const VALID_PW = 'Password01';

function rgbChannels(color: string): [number, number, number] | null {
  const m = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

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
  await expect(errorSummary(page)).toBeVisible();
  await expectFieldError(page, c.username);
  await expectFieldError(page, c.email);
  await expectFieldError(page, c.password);
  await expectFieldError(page, c.confirmPassword);
  await expectFieldError(page, c.terms);
  await expectFirstInvalid(page, c.username);
});

test('valid submission clears stale errors and shows success', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await fillRegistration(page);
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
  await expect(errorSummary(page)).not.toBeVisible();
  await expect(c.username).not.toHaveAttribute('aria-invalid', 'true');
});

test.describe('field policy boundaries', () => {
  test('username boundaries', async ({ page }) => {
    const validCases = ['Ab3', 'a'.repeat(19) + '1', '  TrimmedUser1  '];
    for (const value of validCases) {
      await resetRegistration(page);
      const { email } = uniqueRegistration();
      await fillRegistration(page, { username: value, email });
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
    }
    const invalidCases = ['', 'A1', 'a'.repeat(20) + '12', '1abc', 'user name', 'user@name'];
    for (const value of invalidCases) {
      await resetRegistration(page);
      const { email } = uniqueRegistration();
      await fillRegistration(page, { username: value, email });
      await submitRegistration(page);
      await expectRejection(page);
      await expectFieldError(page, 'username');
    }
  });

  test('email boundaries', async ({ page }) => {
    const validCases = ['user@example.com', '  User@Example.COM  ', 'u@a.b'];
    for (const value of validCases) {
      await resetRegistration(page);
      const { username } = uniqueRegistration();
      await fillRegistration(page, { username, email: value });
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
    }
    const invalidCases = [
      '', 'user', 'user@', '@example.com', 'user @example.com',
      'user..name@example.com', '.user@example.com', 'user.@example.com',
      'user@.com', 'user@exam-.com', 'user@exam..ple.com',
    ];
    for (const value of invalidCases) {
      await resetRegistration(page);
      const { username } = uniqueRegistration();
      await fillRegistration(page, { username, email: value });
      await submitRegistration(page);
      await expectRejection(page);
      await expectFieldError(page, 'email');
    }
  });

  test('password and confirmation boundaries', async ({ page }) => {
    const validPasswords = ['Password01', 'Abcdefghi1', 'A1' + 'x'.repeat(62), 'alllowercase1', 'ALLUPPERCASE1'];
    for (const pw of validPasswords) {
      await resetRegistration(page);
      const { username, email } = uniqueRegistration();
      await fillRegistration(page, { username, email, password: pw });
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
    }
    const invalidPasswords = ['', 'short', 'Password1', 'Abcdefgh1', 'A1' + 'x'.repeat(63), '1234567890'];
    for (const value of invalidPasswords) {
      await resetRegistration(page);
      const { username, email } = uniqueRegistration();
      await fillRegistration(page, { username, email, password: value });
      await submitRegistration(page);
      await expectRejection(page);
      await expectFieldError(page, 'password');
    }
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    await fillRegistration(page, { username, email, password: VALID_PW, confirmPassword: 'Different01' });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'confirmPassword');
  });

  test('date of birth optional and valid', async ({ page }) => {
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    await fillRegistration(page, { username, email, dateOfBirth: '2000-01-15' });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
    await resetRegistration(page);
    const { username: u2, email: e2 } = uniqueRegistration();
    await fillRegistration(page, { username: u2, email: e2, dateOfBirth: '' });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
  });

  test('missing terms rejected', async ({ page }) => {
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    await fillRegistration(page, { username, email, terms: false });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'terms');
  });
});

test('show/hide password toggles both inputs and updates accessible name', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await fillRegistration(page);
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  const nameAfterShow = (await c.passwordToggle.getAttribute('aria-label')) || (await c.passwordToggle.textContent()) || '';
  expect(nameAfterShow).toMatch(/hide/i);
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  const nameAfterHide = (await c.passwordToggle.getAttribute('aria-label')) || (await c.passwordToggle.textContent()) || '';
  expect(nameAfterHide).toMatch(/show/i);
});

test.describe('persistence and duplicates', () => {
  test('successful registration persists trimmed username and lowercased email, survives reload, and rejects duplicates', async ({ page }) => {
    await resetRegistration(page);
    const { username: rawUsername, email: rawEmail } = uniqueRegistration();
    const paddedUsername = '  ' + rawUsername + '  ';
    const mixedCaseEmail = rawEmail.toUpperCase();
    await fillRegistration(page, { username: paddedUsername, email: mixedCaseEmail, password: VALID_PW });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
    const corpus = await storageCorpus(page);
    const allValues = Object.values(corpus).join(' ');
    expect(allValues).toContain(rawUsername);
    expect(allValues).not.toContain(paddedUsername);
    expect(allValues).toContain(rawEmail.toLowerCase());
    expect(allValues).not.toContain(mixedCaseEmail);
    expect(allValues).not.toContain(VALID_PW);
    for (const key of Object.keys(corpus)) {
      expect(key.toLowerCase()).not.toContain('password');
    }
    await page.reload();
    const { username: dupUsername, email: dupEmail } = uniqueRegistration();
    await fillRegistration(page, { username: rawUsername, email: dupEmail });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'username');
    await fillRegistration(page, { username: dupUsername, email: rawEmail.toLowerCase() });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'email');
  });

  test('rejected attempt reserves nothing; retry with same identifiers succeeds after fix', async ({ page }) => {
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    await fillRegistration(page, { username, email, password: 'short' });
    await submitRegistration(page);
    await expectRejection(page);
    await fillRegistration(page, { username, email, password: VALID_PW });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
  });
});

test('presentation and responsive layout', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const header = page.locator('header, [role="banner"]').first();
  await expect(header).toBeVisible();
  const headerColor = await header.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const hc = rgbChannels(headerColor);
  if (hc) {
    expect(hc[2]).toBeGreaterThan(hc[0]);
    expect(hc[2]).toBeGreaterThan(hc[1]);
  }
  const bodyBg = await page.locator('body').evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const bc = rgbChannels(bodyBg);
  if (bc) {
    expect(bc[0]).toBeGreaterThan(200);
    expect(bc[1]).toBeGreaterThan(200);
    expect(bc[2]).toBeGreaterThan(200);
  }
  const panelBg = await c.form.evaluate((el) => {
    let target: HTMLElement | null = el as HTMLElement;
    while (target) {
      const bg = window.getComputedStyle(target).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      target = target.parentElement;
    }
    return '';
  });
  const pc = rgbChannels(panelBg);
  if (pc) {
    expect(pc[0]).toBeGreaterThan(230);
    expect(pc[1]).toBeGreaterThan(230);
    expect(pc[2]).toBeGreaterThan(230);
  }
  const submitColor = await c.submit.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  const sc = rgbChannels(submitColor);
  if (sc) {
    expect(sc[0]).toBeGreaterThan(sc[1]);
    expect(sc[0]).toBeGreaterThan(sc[2]);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  const formBox = await c.form.boundingBox();
  if (formBox) expect(formBox.width).toBeLessThan(1200);
  await page.setViewportSize({ width: 375, height: 667 });
  const narrowFormBox = await c.form.boundingBox();
  if (narrowFormBox) expect(narrowFormBox.width).toBeLessThanOrEqual(375);
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement !== document.body);
  expect(focused).toBeTruthy();
});
