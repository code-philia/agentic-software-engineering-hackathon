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
  await expect(errorSummary(page)).toBeVisible();
  await expectFieldError(page, 'username');
  await expectFieldError(page, 'email');
  await expectFieldError(page, 'password');
  await expectFieldError(page, 'confirmPassword');
  await expectFieldError(page, 'terms');
  await expectFirstInvalid(page, 'username');
});

test('valid submission succeeds and clears stale errors', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
  await expect(errorSummary(page)).not.toBeVisible();
  await expect(c.username).not.toHaveAttribute('aria-invalid', 'true');
});

test.describe('field policy boundaries', () => {
  test('username boundaries', async ({ page }) => {
    await resetRegistration(page);
    const validCases = [
      { value: 'Ab3', label: 'min length 3' },
      { value: 'A'.repeat(20), label: 'max length 20' },
      { value: '  TrimmedUser1  ', label: 'whitespace trimmed' },
    ];
    for (const { value, label } of validCases) {
      await resetRegistration(page);
      const { email } = uniqueRegistration();
      const trimmed = value.trim();
      await fillRegistration(page, { username: value, email });
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
      const stored = await storageCorpus(page);
      const corpus = Object.values(stored).join(' ');
      expect(corpus).toContain(trimmed);
    }
    const invalidCases = [
      { value: 'Ab', label: 'too short' },
      { value: 'A'.repeat(21), label: 'too long' },
      { value: '1abc', label: 'starts with digit' },
      { value: 'a b', label: 'contains space' },
      { value: '', label: 'empty' },
    ];
    for (const { value, label } of invalidCases) {
      await resetRegistration(page);
      const { email } = uniqueRegistration();
      await fillRegistration(page, { username: value, email });
      await submitRegistration(page);
      await expectRejection(page);
      await expectFieldError(page, 'username');
    }
  });

  test('email boundaries', async ({ page }) => {
    await resetRegistration(page);
    const validCases = [
      { value: 'user@example.com', label: 'standard' },
      { value: '  User@Example.COM  ', label: 'whitespace and case' },
      { value: 'u@a.b', label: 'minimal labels' },
    ];
    for (const { value, label } of validCases) {
      await resetRegistration(page);
      const { username } = uniqueRegistration();
      const normalized = value.trim().toLowerCase();
      await fillRegistration(page, { username, email: value });
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
      const stored = await storageCorpus(page);
      const corpus = Object.values(stored).join(' ');
      expect(corpus).toContain(normalized);
    }
    const invalidCases = [
      { value: 'user', label: 'no at-sign' },
      { value: '@example.com', label: 'missing local' },
      { value: 'user@', label: 'missing domain' },
      { value: 'user @example.com', label: 'space before at' },
      { value: 'user.@example.com', label: 'dot-bounded local' },
      { value: 'user@.com', label: 'dot-bounded domain start' },
      { value: 'user@example..com', label: 'repeated dots in domain' },
      { value: 'user@-example.com', label: 'hyphen-bounded domain label' },
      { value: 'user@example.com-', label: 'hyphen-bounded domain end' },
      { value: '', label: 'empty' },
    ];
    for (const { value, label } of invalidCases) {
      await resetRegistration(page);
      const { username } = uniqueRegistration();
      await fillRegistration(page, { username, email: value });
      await submitRegistration(page);
      await expectRejection(page);
      await expectFieldError(page, 'email');
    }
  });

  test('password and confirmation boundaries', async ({ page }) => {
    const validPasswords = [
      { value: 'Password01', label: 'min length 10' },
      { value: 'Abcdefghi1', label: 'another min length 10' },
      { value: 'A1' + 'x'.repeat(62), label: 'max length 64' },
      { value: 'abcdefghij1', label: 'lowercase only letters' },
      { value: 'ABCDEFGHIJ1', label: 'uppercase only letters' },
    ];
    for (const { value, label } of validPasswords) {
      await resetRegistration(page);
      const { username, email } = uniqueRegistration();
      await fillRegistration(page, { username, email, password: value, confirmPassword: value });
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
    }
    const invalidPasswords = [
      { value: 'Pass1', field: 'password', label: 'too short 5' },
      { value: 'Password1', field: 'password', label: 'too short 9' },
      { value: 'A'.repeat(65), field: 'password', label: 'too long 65' },
      { value: '1234567890', field: 'password', label: 'no letter' },
      { value: 'abcdefghij', field: 'password', label: 'no digit' },
    ];
    for (const { value, field, label } of invalidPasswords) {
      await resetRegistration(page);
      const { username, email } = uniqueRegistration();
      await fillRegistration(page, { username, email, password: value, confirmPassword: value });
      await submitRegistration(page);
      await expectRejection(page);
      await expectFieldError(page, field);
    }
    // Mismatch belongs to confirmPassword
    await resetRegistration(page);
    const { username: u2, email: e2 } = uniqueRegistration();
    await fillRegistration(page, { username: u2, email: e2, password: 'Password01', confirmPassword: 'Different1' });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'confirmPassword');
  });

  test('date of birth optional and valid', async ({ page }) => {
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    await fillRegistration(page, { username, email, dateOfBirth: '1990-05-15' });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
    const stored = await storageCorpus(page);
    const corpus = Object.values(stored).join(' ');
    expect(corpus).toContain('1990-05-15');
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
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email });
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  const nameAfterShow = await c.passwordToggle.getAttribute('aria-label') || await c.passwordToggle.textContent();
  expect(nameAfterShow).toMatch(/hide/i);
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  const nameAfterHide = await c.passwordToggle.getAttribute('aria-label') || await c.passwordToggle.textContent();
  expect(nameAfterHide).toMatch(/show/i);
});

test.describe('persistence and duplicates', () => {
  test('successful registration persists and survives reload; duplicate username and email rejected', async ({ page }) => {
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    const pw = 'Password01';
    await fillRegistration(page, { username, email, password: pw, confirmPassword: pw });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();

    // Verify persistence after reload
    await page.reload();
    const c = controls(page);
    await expect(c.heading).toBeVisible();

    // Duplicate username
    const { email: email2 } = uniqueRegistration();
    await fillRegistration(page, { username, email: email2, password: pw, confirmPassword: pw });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'username');

    // Duplicate email (keep original username different)
    const { username: username3 } = uniqueRegistration();
    await fillRegistration(page, { username: username3, email, password: pw, confirmPassword: pw });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'email');
  });

  test('rejected attempt reserves nothing; retry with same identifiers succeeds after fix', async ({ page }) => {
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    // First attempt fails due to short password
    await fillRegistration(page, { username, email, password: 'Short1', confirmPassword: 'Short1' });
    await submitRegistration(page);
    await expectRejection(page);

    // Fix password and retry with same username/email
    const pw = 'Password01';
    await fillRegistration(page, { username, email, password: pw, confirmPassword: pw });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();

    // Verify the identifiers are now reserved
    await page.reload();
    const { email: email2 } = uniqueRegistration();
    await fillRegistration(page, { username, email: email2, password: pw, confirmPassword: pw });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'username');
  });

  test('stored data contains no password values', async ({ page }) => {
    await resetRegistration(page);
    const { username, email } = uniqueRegistration();
    const pw = 'Password01';
    await fillRegistration(page, { username, email, password: pw, confirmPassword: pw });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();

    const stored = await storageCorpus(page);
    const corpus = Object.values(stored).join(' ');
    expect(corpus).not.toContain(pw);
    const keys = Object.keys(stored);
    for (const key of keys) {
      expect(key.toLowerCase()).not.toContain('password');
    }
  });
});

test('presentation and responsive layout', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);

  // Check header is full-width dark navy-blue
  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  const headerColor = await header.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.backgroundColor;
  });
  // Parse rgba(r, g, b, a) and check blue channel dominates
  const headerMatch = headerColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (headerMatch) {
    const r = parseInt(headerMatch[1], 10);
    const g = parseInt(headerMatch[2], 10);
    const b = parseInt(headerMatch[3], 10);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
    expect(r < 100 && g < 100 && b > 100).toBeTruthy();
  }

  // Check page background is pale blue-gray
  const bodyBg = await page.evaluate(() => {
    const style = window.getComputedStyle(document.body);
    return style.backgroundColor;
  });
  const bodyMatch = bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (bodyMatch) {
    const r = parseInt(bodyMatch[1], 10);
    const g = parseInt(bodyMatch[2], 10);
    const b = parseInt(bodyMatch[3], 10);
    expect(r > 200 && g > 200 && b > 200).toBeTruthy();
  }

  // Check registration panel is white and centered
  const formBox = await c.form.boundingBox();
  expect(formBox).not.toBeNull();
  if (formBox) {
    const viewport = page.viewportSize();
    if (viewport) {
      expect(formBox.x + formBox.width / 2).toBeCloseTo(viewport.width / 2, 0);
    }
  }

  // Check submit has orange accent
  const submitColor = await c.submit.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.backgroundColor;
  });
  const submitMatch = submitColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (submitMatch) {
    const r = parseInt(submitMatch[1], 10);
    const g = parseInt(submitMatch[2], 10);
    const b = parseInt(submitMatch[3], 10);
    expect(r > g && r > b).toBeTruthy();
  }

  // Desktop: related fields share rows (check form width allows multi-column)
  await page.setViewportSize({ width: 1200, height: 800 });
  const desktopFormBox = await c.form.boundingBox();
  if (desktopFormBox) {
    expect(desktopFormBox.width).toBeGreaterThan(400);
  }

  // Mobile: single column, no horizontal overflow
  await page.setViewportSize({ width: 375, height: 667 });
  await page.reload();
  const mobileC = controls(page);
  const mobileFormBox = await mobileC.form.boundingBox();
  if (mobileFormBox) {
    expect(mobileFormBox.width).toBeLessThanOrEqual(375);
  }
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);

  // Keyboard focus indicator visible
  await resetRegistration(page);
  const focusedC = controls(page);
  await focusedC.username.focus();
  const outlineStyle = await focusedC.username.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.outlineStyle;
  });
  expect(outlineStyle).not.toBe('none');
});
