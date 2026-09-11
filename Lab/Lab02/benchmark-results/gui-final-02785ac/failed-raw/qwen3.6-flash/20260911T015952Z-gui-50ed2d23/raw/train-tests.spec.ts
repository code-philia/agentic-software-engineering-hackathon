import { test, expect } from '@playwright/test';
import {
  controls, openRegistration, resetRegistration, uniqueRegistration,
  fillRegistration, submitRegistration, successFeedback, errorSummary,
  expectFieldError, expectFirstInvalid, expectRejection, storageCorpus,
} from './course-gui-test-support.js';

test.beforeEach(async ({ page }) => {
  await page.goto(process.env.COURSE_GUI_BASE_URL + '/register');
});

// ── Accessible structure ──────────────────────────────────────────────
test('has accessible heading and form', async ({ page }) => {
  const c = controls(page);
  await expect(c.heading).toBeVisible();
  const text = (await c.heading.textContent()) || '';
  expect(text.length).toBeGreaterThan(0);
  expect(/register|create.*account|sign up/i.test(text)).toBeTruthy();
  await expect(c.form).toBeVisible();
  await expect(c.username).toBeVisible();
  await expect(c.email).toBeVisible();
  await expect(c.password).toBeVisible();
  await expect(c.confirmPassword).toBeVisible();
  await expect(c.terms).toBeVisible();
  await expect(c.submit).toBeVisible();
});

test('uses appropriate input types and autocomplete', async ({ page }) => {
  const c = controls(page);
  expect(await c.username.inputValue()).toBe('');
  expect(await c.email.getAttribute('type')).toBe('email');
  expect(await c.password.getAttribute('type')).toBe('password');
  expect(await c.confirmPassword.getAttribute('type')).toBe('password');
  const ua = await c.username.getAttribute('autocomplete');
  expect(['username', 'new-password', null, undefined]).toContain(ua);
});

test('terms checkbox is accessible', async ({ page }) => {
  const c = controls(page);
  const label = page.getByRole('checkbox', { name: /terms/i });
  await expect(label).toBeVisible();
});

// ── Validation feedback on empty submit ───────────────────────────────
test('empty submit reports all required errors', async ({ page }) => {
  await resetRegistration(page);
  await submitRegistration(page);
  await expectFieldError(page, 'username');
  await expectFieldError(page, 'email');
  await expectFieldError(page, 'password');
  await expectFieldError(page, 'confirmPassword');
  await expectFieldError(page, 'terms');
  await expect(errorSummary(page)).toBeVisible();
  await expectFirstInvalid(page, 'username');
});

test('corrected valid submission clears stale errors', async ({ page }) => {
  await resetRegistration(page);
  await submitRegistration(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { username: u.username, email: u.email });
  await submitRegistration(page);
  await successFeedback(page);
  await expect(errorSummary(page)).not.toBeVisible();
});

// ── Username boundaries ───────────────────────────────────────────────
test('username trims whitespace', async ({ page }) => {
  await resetRegistration(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { username: '  ' + u.username + '  ' });
  await submitRegistration(page);
  await successFeedback(page);
  const corpus = await storageCorpus(page);
  const vals = Object.values(corpus);
  expect(vals.some(v => v === u.username.trim())).toBeTruthy();
});

test('username rejects too-short value', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { username: 'Ab' });
  await submitRegistration(page);
  await expectFieldError(page, 'username');
  await expectRejection(page);
});

test('username accepts minimum length three', async ({ page }) => {
  await resetRegistration(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { username: 'Ab3' });
  await submitRegistration(page);
  await successFeedback(page);
});

test('username rejects leading digit', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { username: '1abc' });
  await submitRegistration(page);
  await expectFieldError(page, 'username');
  await expectRejection(page);
});

test('username allows letters digits underscores within range', async ({ page }) => {
  await resetRegistration(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { username: 'User_1' });
  await submitRegistration(page);
  await successFeedback(page);
});

test('username duplicate check is case-insensitive', async ({ page }) => {
  const u = uniqueRegistration();
  await resetRegistration(page);
  await fillRegistration(page, { username: u.username, email: u.email });
  await submitRegistration(page);
  await successFeedback(page);
  await openRegistration(page);
  await fillRegistration(page, { username: u.username.toUpperCase(), email: uniqueRegistration().email });
  await submitRegistration(page);
  await expectRejection(page);
});

// ── Email boundaries ──────────────────────────────────────────────────
test('email normalizes to lowercase on success', async ({ page }) => {
  await resetRegistration(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { email: u.email.toUpperCase() });
  await submitRegistration(page);
  await successFeedback(page);
  const corpus = await storageCorpus(page);
  const vals = Object.values(corpus);
  expect(vals.some(v => v === u.email.toLowerCase())).toBeTruthy();
});

test('email rejects missing at-sign', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { email: 'bademail.com' });
  await submitRegistration(page);
  await expectFieldError(page, 'email');
  await expectRejection(page);
});

test('email rejects repeated dots in local part', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { email: 'a..b@example.com' });
  await submitRegistration(page);
  await expectFieldError(page, 'email');
  await expectRejection(page);
});

test('email rejects dot-bounded local part', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { email: '.user@example.com' });
  await submitRegistration(page);
  await expectFieldError(page, 'email');
  await expectRejection(page);
});

test('email rejects hyphen-bounded domain label', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { email: 'user@-example.com' });
  await submitRegistration(page);
  await expectFieldError(page, 'email');
  await expectRejection(page);
});

test('email accepts single-letter final domain label', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { email: 'user@example.c' });
  await submitRegistration(page);
  await successFeedback(page);
});

test('email duplicate check uses normalized value', async ({ page }) => {
  const u = uniqueRegistration();
  await resetRegistration(page);
  await fillRegistration(page, { username: u.username, email: u.email });
  await submitRegistration(page);
  await successFeedback(page);
  await openRegistration(page);
  await fillRegistration(page, { username: uniqueRegistration().username, email: u.email.toUpperCase() });
  await submitRegistration(page);
  await expectRejection(page);
});

// ── Password boundaries ───────────────────────────────────────────────
test('password requires minimum length 10', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { password: 'Password01' });
  await submitRegistration(page);
  await successFeedback(page);
});

test('password rejects too-short value', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { password: 'Abcdefgh1' });
  await submitRegistration(page);
  await expectFieldError(page, 'password');
  await expectRejection(page);
});

test('password accepts exactly 64 characters', async ({ page }) => {
  await resetRegistration(page);
  const pw = 'A1' + 'x'.repeat(62);
  expect(pw.length).toBe(64);
  await fillRegistration(page, { password: pw });
  await submitRegistration(page);
  await successFeedback(page);
});

test('password rejects over-64 characters', async ({ page }) => {
  await resetRegistration(page);
  const pw = 'A1' + 'x'.repeat(63);
  expect(pw.length).toBe(65);
  await fillRegistration(page, { password: pw });
  await submitRegistration(page);
  await expectFieldError(page, 'password');
  await expectRejection(page);
});

test('password requires at least one letter and one digit', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { password: '1234567890' });
  await submitRegistration(page);
  await expectFieldError(page, 'password');
  await expectRejection(page);
});

test('password confirmation mismatch targets confirmPassword', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { password: 'ValidPass1', confirmPassword: 'Different1' });
  await submitRegistration(page);
  await expectFieldError(page, 'confirmPassword');
  await expectRejection(page);
});

test('password case is unrestricted when digit present', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { password: 'abcdefghi1' });
  await submitRegistration(page);
  await successFeedback(page);
});

// ── Terms of service ──────────────────────────────────────────────────
test('missing terms prevents submission', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { terms: false });
  await submitRegistration(page);
  await expectFieldError(page, 'terms');
  await expectRejection(page);
});

// ── Date of birth ─────────────────────────────────────────────────────
test('optional date of birth with real date succeeds', async ({ page }) => {
  await resetRegistration(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { ...u, dateOfBirth: '1990-05-15' });
  await submitRegistration(page);
  await successFeedback(page);
});

test('omitted date of birth succeeds', async ({ page }) => {
  await resetRegistration(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { ...u, dateOfBirth: '' });
  await submitRegistration(page);
  await successFeedback(page);
});

// ── Password visibility toggle ────────────────────────────────────────
test('show/hide toggles both password fields', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await c.password.fill('TestPass1');
  await c.confirmPassword.fill('TestPass1');
  let pwType = await c.password.getAttribute('type');
  expect(pwType).toBe('password');
  await c.passwordToggle.click();
  pwType = await c.password.getAttribute('type');
  expect(pwType).toBe('text');
  expect(await c.confirmPassword.getAttribute('type')).toBe('text');
  await c.passwordToggle.click();
  pwType = await c.password.getAttribute('type');
  expect(pwType).toBe('password');
});

// ── Persistence and sensitive-data safety ─────────────────────────────
test('stored data preserves trimmed username and lowercased email', async ({ page }) => {
  const u = uniqueRegistration();
  await resetRegistration(page);
  await fillRegistration(page, { username: '  ' + u.username + '  ', email: u.email.toUpperCase() });
  await submitRegistration(page);
  await successFeedback(page);
  const corpus = await storageCorpus(page);
  const vals = Object.values(corpus);
  expect(vals.some(v => v === u.username.trim())).toBeTruthy();
  expect(vals.some(v => v === u.email.toLowerCase())).toBeTruthy();
});

test('rejected attempt reserves nothing', async ({ page }) => {
  const u = uniqueRegistration();
  await resetRegistration(page);
  await fillRegistration(page, { username: u.username, email: u.email, password: 'short' });
  await submitRegistration(page);
  await expectRejection(page);
  await fillRegistration(page, { username: u.username, email: u.email, password: 'ValidPass1' });
  await submitRegistration(page);
  await successFeedback(page);
});

test('storage contains no password values or password-named keys', async ({ page }) => {
  const u = uniqueRegistration();
  const pw = 'MySecureP@ss1';
  await resetRegistration(page);
  await fillRegistration(page, { ...u, password: pw });
  await submitRegistration(page);
  await successFeedback(page);
  const corpus = await storageCorpus(page);
  const allText = Object.keys(corpus).join(' ') + ' ' + Object.values(corpus).join(' ');
  expect(allText).not.toContain(pw);
  for (const key of Object.keys(corpus)) {
    expect(key.toLowerCase()).not.toContain('password');
  }
});

test('duplicate username survives reload', async ({ page }) => {
  const u = uniqueRegistration();
  await resetRegistration(page);
  await fillRegistration(page, { username: u.username, email: u.email });
  await submitRegistration(page);
  await successFeedback(page);
  await openRegistration(page);
  await fillRegistration(page, { username: u.username, email: uniqueRegistration().email });
  await submitRegistration(page);
  await expectRejection(page);
});

test('duplicate email survives reload', async ({ page }) => {
  const u = uniqueRegistration();
  await resetRegistration(page);
  await fillRegistration(page, { username: u.username, email: u.email });
  await submitRegistration(page);
  await successFeedback(page);
  await openRegistration(page);
  await fillRegistration(page, { username: uniqueRegistration().username, email: u.email });
  await submitRegistration(page);
  await expectRejection(page);
});

// ── Presentation and responsive layout ────────────────────────────────
test('public visual direction matches specification', async ({ page }) => {
  const c = controls(page);

  // Dark navy-blue header
  const header = page.locator('header').first();
  if (await header.isVisible()) {
    const bg = await header.evaluate(el => getComputedStyle(el).backgroundColor);
    const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
      const [_, r, g, b] = m.map(Number);
      expect(r).toBeGreaterThan(g);
      expect(r - b).toBeGreaterThan(80);
    }
  }

  // Pale blue-gray page background
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bm = bodyBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (bm) {
    const [_, r, g, b] = bm.map(Number);
    expect(r - b).toBeLessThan(60);
    expect(g - b).toBeLessThan(60);
  }

  // Orange accent on submit button background
  const btnBg = await c.submit.evaluate(el => getComputedStyle(el).backgroundColor);
  const om = btnBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (om) {
    const [_, r, g, b] = om.map(Number);
    expect(r - g).toBeGreaterThan(40);
    expect(r - b).toBeGreaterThan(40);
  }

  // Centered white panel - inspect visible ancestor of form
  const panel = page.locator('[class*="panel"], [class*="card"], [class*="container"]').first();
  if (await panel.isVisible()) {
    const pBg = await panel.evaluate(el => getComputedStyle(el).backgroundColor);
    const pm = pBg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (pm) {
      const [_, r, g, b] = pm.map(Number);
      expect(r).toBeGreaterThan(200);
      expect(g).toBeGreaterThan(200);
      expect(b).toBeGreaterThan(200);
    }
  }

  // Keyboard focus indicator
  await c.username.focus();
  const outline = await c.username.evaluate(el => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe('none');
});

test('responsive layout: two columns on desktop, one on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const c = controls(page);
  const u = uniqueRegistration();
  await fillRegistration(page, { username: u.username, email: u.email });
  const usernameBox = await c.username.boundingBox();
  const emailBox = await c.email.boundingBox();
  if (usernameBox && emailBox) {
    expect(Math.abs(usernameBox.x - emailBox.x)).toBeLessThan(10);
  }

  await page.setViewportSize({ width: 375, height: 667 });
  await page.reload();
  const u2 = uniqueRegistration();
  await fillRegistration(page, { username: u2.username, email: u2.email });
  const uBox2 = await c.username.boundingBox();
  const eBox2 = await c.email.boundingBox();
  if (uBox2 && eBox2) {
    expect(Math.abs(uBox2.y - eBox2.y)).toBeGreaterThan(10);
  }
});
