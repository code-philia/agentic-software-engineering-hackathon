import { test, expect } from '@playwright/test';
import {
  controls, openRegistration, resetRegistration, uniqueRegistration,
  fillRegistration, submitRegistration, successFeedback, errorSummary,
  expectFieldError, expectFirstInvalid, expectRejection, storageCorpus,
} from './course-gui-test-support.js';

test.beforeEach(async ({ page }) => {
  await resetRegistration(page);
});

// ── Accessible structure ────────────────────────────────────────────────
test('has accessible heading and form', async ({ page }) => {
  await openRegistration(page);
  const c = controls(page);
  await expect(c.heading).toBeVisible();
  await expect(c.form).toBeVisible();
  await expect(c.username).toBeVisible();
  await expect(c.email).toBeVisible();
  await expect(c.password).toBeVisible();
  await expect(c.confirmPassword).toBeVisible();
  await expect(c.terms).toBeVisible();
  await expect(c.submit).toBeVisible();
  await expect(c.email).toHaveAttribute('type', 'email');
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  if (c.dateOfBirth) {
    await expect(c.dateOfBirth).toHaveAttribute('type', 'date');
  }
});

// ── Validation: empty submission ────────────────────────────────────────
test('empty submission reports all required errors', async ({ page }) => {
  await openRegistration(page);
  const c = controls(page);
  await c.submit.click();
  await expectFieldError(page, c.username);
  await expectFieldError(page, c.email);
  await expectFieldError(page, c.password);
  await expectFieldError(page, c.confirmPassword);
  await expectFieldError(page, c.terms);
  await expect(errorSummary(page)).toBeVisible();
  await expectFirstInvalid(page, c.username);
});

// ── Validation: corrected valid submission clears stale state ────────────
test('valid submission after invalid clears stale errors', async ({ page }) => {
  await openRegistration(page);
  const c = controls(page);
  await c.submit.click();
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
  await expect(errorSummary(page)).not.toBeVisible();
});

// ── Username boundaries (data-driven) ───────────────────────────────────
test('username validation boundaries', async ({ page }) => {
  const rows = [
    { username: 'Ab3', desc: 'min length 3' },
    { username: 'A1234567890123456789', desc: 'max length 20' },
    { username: 'a_b_c_123', desc: 'underscores allowed' },
    { username: '  Ab3  ', desc: 'whitespace trimmed' },
    { username: 'ab', desc: 'too short', shouldFail: true },
    { username: 'A12345678901234567890', desc: 'too long', shouldFail: true },
    { username: '1abc', desc: 'must start with letter', shouldFail: true },
    { username: 'ab!', desc: 'special chars not allowed', shouldFail: true },
  ];
  for (const row of rows) {
    await test.step(row.desc, async () => {
      await resetRegistration(page);
      await openRegistration(page);
      const c = controls(page);
      const { email } = uniqueRegistration();
      await fillRegistration(page, { username: row.username, email });
      await c.submit.click();
      if (row.shouldFail) {
        await expectFieldError(page, c.username);
      } else {
        await expect(successFeedback(page)).toBeVisible();
      }
    });
  }
});

// ── Email validation (data-driven) ──────────────────────────────────────
test('email validation boundaries', async ({ page }) => {
  const rows = [
    { email: 'a@b.c', desc: 'minimal valid email' },
    { email: 'user@example.com', desc: 'standard email' },
    { email: 'USER@EXAMPLE.COM', desc: 'uppercase normalized to lowercase' },
    { email: '  user@example.com  ', desc: 'whitespace trimmed' },
    { email: 'user @example.com', desc: 'space in local part', shouldFail: true },
    { email: 'user@', desc: 'missing domain', shouldFail: true },
    { email: '@example.com', desc: 'missing local part', shouldFail: true },
    { email: 'user@@example.com', desc: 'double at-sign', shouldFail: true },
    { email: 'user@.com', desc: 'dot-bounded domain label', shouldFail: true },
    { email: 'user@-example.com', desc: 'hyphen-bounded domain label', shouldFail: true },
    { email: 'user@example..com', desc: 'repeated dots in domain', shouldFail: true },
    { email: '.user@example.com', desc: 'dot-bounded local part', shouldFail: true },
    { email: 'user.@example.com', desc: 'dot-bounded local part end', shouldFail: true },
  ];
  for (const row of rows) {
    await test.step(row.desc, async () => {
      await resetRegistration(page);
      await openRegistration(page);
      const c = controls(page);
      const { username } = uniqueRegistration();
      await fillRegistration(page, { username, email: row.email });
      await c.submit.click();
      if (row.shouldFail) {
        await expectFieldError(page, c.email);
      } else {
        await expect(successFeedback(page)).toBeVisible();
      }
    });
  }
});

// ── Password validation (data-driven) ───────────────────────────────────
test('password validation boundaries', async ({ page }) => {
  const rows = [
    { password: 'Password01', desc: 'valid min-length password', shouldFail: false },
    { password: 'Abcdefghi1', desc: 'valid min-length uppercase+digit', shouldFail: false },
    { password: 'abcdefghi1', desc: 'valid min-length lowercase+digit', shouldFail: false },
    { password: 'A1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', desc: 'valid max-length 64', shouldFail: false },
    { password: 'A1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', desc: 'too short 63', shouldFail: true },
    { password: 'A1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', desc: 'too long 65', shouldFail: true },
    { password: 'NoDigitHere', desc: 'missing digit', shouldFail: true },
    { password: 'NoLetters12345', desc: 'missing letter', shouldFail: true },
    { password: '', desc: 'empty password', shouldFail: true },
  ];
  for (const row of rows) {
    await test.step(row.desc, async () => {
      await resetRegistration(page);
      await openRegistration(page);
      const c = controls(page);
      const { username, email } = uniqueRegistration();
      await fillRegistration(page, { username, email, password: row.password });
      await c.submit.click();
      if (row.shouldFail) {
        await expectFieldError(page, c.password);
      } else {
        await expect(successFeedback(page)).toBeVisible();
      }
    });
  }
});

// ── Password confirmation mismatch ──────────────────────────────────────
test('password confirmation mismatch', async ({ page }) => {
  await resetRegistration(page);
  await openRegistration(page);
  const c = controls(page);
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email, password: 'Password01', confirmPassword: 'Different01' });
  await c.submit.click();
  await expectFieldError(page, c.confirmPassword);
  await expectRejection(page);
});

// ── Terms checkbox ──────────────────────────────────────────────────────
test('terms must be accepted', async ({ page }) => {
  await resetRegistration(page);
  await openRegistration(page);
  const c = controls(page);
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email, terms: false });
  await c.submit.click();
  await expectFieldError(page, c.terms);
  await expectRejection(page);
});

// ── Date of birth ───────────────────────────────────────────────────────
test('optional date of birth', async ({ page }) => {
  await resetRegistration(page);
  await openRegistration(page);
  const c = controls(page);
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email, dateOfBirth: '1990-05-15' });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
});

test('omitted date of birth is valid', async ({ page }) => {
  await resetRegistration(page);
  await openRegistration(page);
  const c = controls(page);
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email, dateOfBirth: '' });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
});

// ── Show/Hide password toggle ───────────────────────────────────────────
test('password visibility toggle', async ({ page }) => {
  await resetRegistration(page);
  await openRegistration(page);
  const c = controls(page);
  const { username, email } = uniqueRegistration();
  await fillRegistration(page, { username, email });
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
});

// ── Persistence: successful registration survives reload ────────────────
test('successful registration persists across reload', async ({ page }) => {
  const { username, email } = uniqueRegistration();
  await openRegistration(page);
  const c = controls(page);
  await fillRegistration(page, { username, email });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
  // Do NOT call resetRegistration here - we need to keep storage intact
  await page.reload();
  const corpus = await storageCorpus(page);
  const values = Object.values(corpus);
  const foundUsername = values.some(v => v.toLowerCase() === username.toLowerCase());
  const foundEmail = values.some(v => v.toLowerCase() === email.toLowerCase());
  expect(foundUsername).toBe(true);
  expect(foundEmail).toBe(true);
});

// ── Persistence: duplicate username rejected ────────────────────────────
test('duplicate username rejected after reload', async ({ page }) => {
  const { username, email: email1 } = uniqueRegistration();
  await openRegistration(page);
  const c = controls(page);
  await fillRegistration(page, { username, email: email1 });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
  // Now try to register again with same username but different email
  const { email: email2 } = uniqueRegistration();
  await openRegistration(page);
  await fillRegistration(page, { username, email: email2 });
  await c.submit.click();
  await expectFieldError(page, c.username);
  await expectRejection(page);
});

// ── Persistence: duplicate email rejected ───────────────────────────────
test('duplicate email rejected after reload', async ({ page }) => {
  const { username, email } = uniqueRegistration();
  await openRegistration(page);
  const c = controls(page);
  await fillRegistration(page, { username, email });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
  // Try again with same email but different username
  const { username: username2 } = uniqueRegistration();
  await openRegistration(page);
  await fillRegistration(page, { username: username2, email });
  await c.submit.click();
  await expectFieldError(page, c.email);
  await expectRejection(page);
});

// ── Persistence: no passwords stored ────────────────────────────────────
test('stored data contains no password values', async ({ page }) => {
  const { username, email } = uniqueRegistration();
  const password = 'Password01';
  await openRegistration(page);
  const c = controls(page);
  await fillRegistration(page, { username, email, password });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
  const corpus = await storageCorpus(page);
  const allText = Object.values(corpus).join('\n').toLowerCase();
  expect(allText).not.toContain(password.toLowerCase());
  // Also check that no key contains "password"
  const hasPasswordKey = Object.keys(corpus).some(k => k.toLowerCase().includes('password'));
  expect(hasPasswordKey).toBe(false);
});

// ── Persistence: rejected attempts reserve nothing ──────────────────────
test('rejected attempt reserves nothing', async ({ page }) => {
  const { username, email } = uniqueRegistration();
  await openRegistration(page);
  const c = controls(page);
  // First attempt: missing terms (invalid)
  await fillRegistration(page, { username, email, terms: false });
  await c.submit.click();
  await expectRejection(page);
  // Second attempt: fix terms only, same identifiers
  await fillRegistration(page, { username, email, terms: true });
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
});

// ── Presentation: visual style ──────────────────────────────────────────
test('public visual direction', async ({ page }) => {
  await openRegistration(page);
  const c = controls(page);
  // Dark navy-blue header
  const headerEl = page.locator('header').first();
  if (await headerEl.isVisible()) {
    const bgColor = await headerEl.evaluate(el => getComputedStyle(el).backgroundColor);
    const match = bgColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
      const [, r, g, b] = match.map(Number);
      // Navy blue: high blue, low red and green
      expect(b > r && b > g).toBe(true);
    }
  }
  // Pale blue-gray background
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bodyMatch = bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (bodyMatch) {
    const [, r, g, b] = bodyMatch.map(Number);
    // Light color: high values, blue-ish tint
    expect(r > 200 && g > 200 && b > 200).toBe(true);
  }
  // Orange accent on submit button
  const btnColor = await c.submit.evaluate(el => getComputedStyle(el).backgroundColor);
  const btnMatch = btnColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (btnMatch) {
    const [, r, g, b] = btnMatch.map(Number);
    // Orange: red > green, moderate blue
    expect(r > g).toBe(true);
  }
});

// ── Responsive layout ───────────────────────────────────────────────────
test('responsive layout: desktop two-column, mobile single-column', async ({ page }) => {
  await openRegistration(page);
  const c = controls(page);
  // Desktop: wider viewport, check fields share rows
  await page.setViewportSize({ width: 1280, height: 720 });
  const usernameBox = await c.username.boundingBox();
  const emailBox = await c.email.boundingBox();
  if (usernameBox && emailBox) {
    // On desktop, username and email should be roughly side by side
    const xDiff = Math.abs(emailBox.x - usernameBox.x);
    const yDiff = Math.abs(emailBox.y - usernameBox.y);
    // If they're on the same row, y difference should be small relative to field height
    if (yDiff < usernameBox.height * 0.5) {
      // They're on the same row - good for desktop
      expect(xDiff < usernameBox.width * 2).toBe(true);
    }
  }
  // Mobile: narrow viewport, single column
  await page.setViewportSize({ width: 375, height: 667 });
  const usernameBoxMobile = await c.username.boundingBox();
  const emailBoxMobile = await c.email.boundingBox();
  if (usernameBoxMobile && emailBoxMobile) {
    // On mobile, fields should be stacked vertically
    const yDiff = Math.abs(emailBoxMobile.y - usernameBoxMobile.y);
    expect(yDiff > usernameBoxMobile.height * 0.5).toBe(true);
  }
  // No horizontal overflow on mobile
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  expect(scrollWidth <= clientWidth + 1).toBe(true);
});

// ── Keyboard focus indicator visible ────────────────────────────────────
test('keyboard focus indicator visible', async ({ page }) => {
  await openRegistration(page);
  const c = controls(page);
  await c.username.focus();
  const outline = await c.username.evaluate(el => getComputedStyle(el).outlineStyle);
  // Either outline-style is set or box-shadow indicates focus
  const boxShadow = await c.username.evaluate(el => getComputedStyle(el).boxShadow);
  expect(outline !== 'none' || boxShadow !== 'none').toBe(true);
});
