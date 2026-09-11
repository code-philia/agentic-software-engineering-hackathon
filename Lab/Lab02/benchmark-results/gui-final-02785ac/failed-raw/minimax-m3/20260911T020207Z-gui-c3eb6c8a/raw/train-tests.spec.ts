import { test, expect } from '@playwright/test';
import {
  controls, openRegistration, resetRegistration, uniqueRegistration,
  fillRegistration, submitRegistration, successFeedback, errorSummary,
  expectFieldError, expectFirstInvalid, expectRejection, storageCorpus,
} from './course-gui-test-support.js';

const URL = process.env.COURSE_GUI_BASE_URL!;

function parseChannels(s: string): number[] {
  const m = s.match(/\d+(?:\.\d+)?/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}

async function colorOf(loc: { evaluate: (fn: (n: Element) => string) => Promise<string> }): Promise<number[]> {
  const raw = await loc.evaluate(n => getComputedStyle(n as Element).color);
  return parseChannels(raw);
}

test.beforeEach(async ({ page }) => { await page.goto(URL); });

test('accessible structure: semantic heading, form, inputs, autocomplete, terms, submit', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await expect(c.heading).toBeVisible();
  await expect(c.heading).toHaveText(/register|create.*account|sign up/i);
  await expect(c.form).toBeVisible();
  await expect(c.username).toHaveAttribute('autocomplete', /username/);
  await expect(c.email).toHaveAttribute('autocomplete', /email/);
  await expect(c.password).toHaveAttribute('autocomplete', /new-password/);
  await expect(c.confirmPassword).toHaveAttribute('autocomplete', /new-password/);
  await expect(c.email).toHaveAttribute('type', 'email');
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  if (await c.dateOfBirth.count() > 0) {
    await expect(c.dateOfBirth).toHaveAttribute('type', 'date');
  }
  await expect(c.terms).toBeVisible();
  await expect(c.submit).toBeVisible();
  await expect(c.submit).toBeEnabled();
  const termsTag = await c.terms.evaluate(n => (n as HTMLInputElement).tagName);
  expect(termsTag).toBe('INPUT');
});

test('empty submission reports every required problem, summarizes, focuses first invalid', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  await submitRegistration(page);
  const summary = errorSummary(page);
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(/.+/);
  await expectFieldError(page, c.username);
  await expectFieldError(page, c.email);
  await expectFieldError(page, c.password);
  await expectFieldError(page, c.confirmPassword);
  await expectFieldError(page, c.terms);
  await expectRejection(page);
  await expectFirstInvalid(page, c.username);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email });
  await expect(successFeedback(page)).toBeVisible();
});

test('username boundaries: trim, length, leading char, allowed chars', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const okId = uniqueRegistration();
  const cases: Array<{ username: string; ok: boolean }> = [
    { username: 'Ab', ok: false },
    { username: 'Ab3', ok: true },
    { username: '1abc', ok: false },
    { username: 'A_b_1', ok: true },
    { username: 'A b c', ok: false },
    { username: 'A.b', ok: false },
    { username: 'A-b', ok: false },
    { username: '  Ab3  ', ok: true },
  ];
  for (const row of cases) {
    const id = uniqueRegistration();
    const override: { username: string; email: string } = { username: row.username, email: id.email };
    if (row.ok) override.username = row.username;
    await fillRegistration(page, override);
    if (row.ok) {
      await expect(successFeedback(page)).toBeVisible();
      const stored = (await c.username.inputValue()).trim();
      expect(stored).toBe(row.username.trim());
    } else {
      await expectFieldError(page, c.username);
      await expectRejection(page);
    }
  }
  const longName = 'A' + 'a'.repeat(19);
  const idMax = uniqueRegistration();
  await fillRegistration(page, { username: longName, email: idMax.email });
  await expect(successFeedback(page)).toBeVisible();
  const tooLong = 'A' + 'a'.repeat(20);
  const idOver = uniqueRegistration();
  await fillRegistration(page, { username: tooLong, email: idOver.email });
  await expectFieldError(page, c.username);
  await expectRejection(page);
});

test('email boundaries: trim, lowercase normalization, syntax, labels', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const cases: Array<{ email: string; ok: boolean }> = [
    { email: 'Abc.example.com', ok: false },
    { email: '@example.com', ok: false },
    { email: 'Abc@', ok: false },
    { email: 'ab c@example.com', ok: false },
    { email: 'ab..cd@example.com', ok: false },
    { email: '.abc@example.com', ok: false },
    { email: 'abc.@example.com', ok: false },
    { email: 'abc@-exa.com', ok: false },
    { email: 'abc@exa..com', ok: false },
    { email: 'user@example.a', ok: true },
    { email: '  Mixed.User@Example.COM  ', ok: true },
  ];
  for (const row of cases) {
    const id = uniqueRegistration();
    await fillRegistration(page, { email: row.email, username: id.username });
    if (row.ok) {
      await expect(successFeedback(page)).toBeVisible();
      const stored = (await c.email.inputValue()).trim();
      expect(stored).toBe(row.email.trim().toLowerCase());
    } else {
      await expectFieldError(page, c.email);
      await expectRejection(page);
    }
  }
});

test('password and confirmation boundaries: length, classes, mismatch', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const okLower = 'Abcdefghi1';
  const okUpper = 'ABCDEFGHI1';
  const tooShort = 'Abcdefgh1';
  const id1 = uniqueRegistration();
  await fillRegistration(page, { password: tooShort, confirmPassword: tooShort, username: id1.username, email: id1.email });
  await expectFieldError(page, c.password);
  await expectRejection(page);
  const id2 = uniqueRegistration();
  await fillRegistration(page, { password: okLower, confirmPassword: okLower, username: id2.username, email: id2.email });
  await expect(successFeedback(page)).toBeVisible();
  const id3 = uniqueRegistration();
  await fillRegistration(page, { password: okUpper, confirmPassword: okUpper, username: id3.username, email: id3.email });
  await expect(successFeedback(page)).toBeVisible();
  const id4 = uniqueRegistration();
  await fillRegistration(page, { password: okLower, confirmPassword: okLower + 'X', username: id4.username, email: id4.email });
  await expectFieldError(page, c.confirmPassword);
  await expectRejection(page);
  const maxPw = 'A1' + 'x'.repeat(62);
  const id5 = uniqueRegistration();
  await fillRegistration(page, { password: maxPw, confirmPassword: maxPw, username: id5.username, email: id5.email });
  await expect(successFeedback(page)).toBeVisible();
  const id6 = uniqueRegistration();
  await fillRegistration(page, { password: 'NoDigitsHere', confirmPassword: 'NoDigitsHere', username: id6.username, email: id6.email });
  await expectFieldError(page, c.password);
  await expectRejection(page);
  const id7 = uniqueRegistration();
  await fillRegistration(page, { password: '1234567890', confirmPassword: '1234567890', username: id7.username, email: id7.email });
  await expectFieldError(page, c.password);
  await expectRejection(page);
});

test('terms checkbox must be accepted', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { terms: false, username: id.username, email: id.email });
  await expectFieldError(page, c.terms);
  await expectRejection(page);
  await fillRegistration(page, { terms: true, username: id.username, email: id.email });
  await expect(successFeedback(page)).toBeVisible();
});

test('optional date of birth accepts a real Gregorian date and omission', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  if (await c.dateOfBirth.count() === 0) return;
  const id1 = uniqueRegistration();
  await fillRegistration(page, { dateOfBirth: '1990-06-15', username: id1.username, email: id1.email });
  await expect(successFeedback(page)).toBeVisible();
  await expect(c.dateOfBirth).toHaveValue('1990-06-15');
  const id2 = uniqueRegistration();
  await fillRegistration(page, { dateOfBirth: '', username: id2.username, email: id2.email });
  await expect(successFeedback(page)).toBeVisible();
});

test('show/hide password action toggles both inputs and updates accessible name', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email, password: 'Abcdefghi1', confirmPassword: 'Abcdefghi1' });
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  const nameBefore = (await c.passwordToggle.evaluate(n => n.getAttribute('aria-label') ?? n.textContent ?? '')).trim();
  expect(nameBefore.length).toBeGreaterThan(0);
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  const nameAfter = (await c.passwordToggle.evaluate(n => n.getAttribute('aria-label') ?? n.textContent ?? '')).trim();
  expect(nameAfter.length).toBeGreaterThan(0);
  expect(nameAfter).not.toBe(nameBefore);
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
});

test('persistence: trimmed/lower normalization, duplicates survive reload, no passwords stored', async ({ page }) => {
  await openRegistration(page);
  const c = controls(page);
  const rawUser = '  Mixed_User_1  ';
  const rawMail = '  Mixed.User@Example.COM  ';
  const secretPw = 'Abcdefghi1';
  await fillRegistration(page, { username: rawUser, email: rawMail, password: secretPw, confirmPassword: secretPw });
  await expect(successFeedback(page)).toBeVisible();
  await page.reload();
  const id = uniqueRegistration();
  await fillRegistration(page, { username: 'mixed_user_1', email: id.email });
  await expectFieldError(page, c.username);
  await expectRejection(page);
  await fillRegistration(page, { username: id.username, email: 'mixed.user@example.com' });
  await expectFieldError(page, c.email);
  await expectRejection(page);
  const corpus = await storageCorpus(page);
  const allText = Object.values(corpus).join('\n');
  expect(allText).not.toContain(secretPw);
  for (const k of Object.keys(corpus)) {
    expect(k.toLowerCase()).not.toMatch(/password/);
  }
  expect(allText.toLowerCase()).not.toContain('password');
  expect(allText).toContain('Mixed_User_1');
  expect(allText).toContain('mixed.user@example.com');
});

test('rejected attempts reserve nothing', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email, password: 'Abcdefgh1' });
  await expectFieldError(page, c.password);
  await expectRejection(page);
  const corpus1 = await storageCorpus(page);
  const all1 = Object.values(corpus1).join('\n');
  expect(all1).not.toContain(id.username);
  expect(all1).not.toContain(id.email);
  await fillRegistration(page, { username: id.username, email: id.email, password: 'Abcdefghi1', confirmPassword: 'Abcdefghi1' });
  await expect(successFeedback(page)).toBeVisible();
  const corpus2 = await storageCorpus(page);
  const all2 = Object.values(corpus2).join('\n');
  expect(all2).toContain(id.username);
  expect(all2).toContain(id.email);
});

test('public visual direction: header, page, panel, accent, layout, focus indicator', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const header = page.locator('header, [role="banner"]').first();
  await expect(header).toBeVisible();
  const headerBox = await header.boundingBox();
  const vp = page.viewportSize()!;
  expect(headerBox!.width).toBeGreaterThanOrEqual(vp.width - 1);
  const headerRGB = await colorOf(header);
  const pageRGB = await colorOf(page.locator('body'));
  const panel = page.locator('main, section, [role="main"], form').first();
  await expect(panel).toBeVisible();
  let panelRGB = await colorOf(panel);
  if (panelRGB[0] === panelRGB[1] && panelRGB[1] === panelRGB[2] && panelRGB[0] === 0) {
    const ancestors = panel.locator('xpath=ancestor::*[self::main or self::section or self::div][1]');
    panelRGB = await colorOf(ancestors);
  }
  const submitRGB = await colorOf(c.submit);
  const submitBgRaw = await c.submit.evaluate(n => getComputedStyle(n as Element).backgroundColor);
  const submitBg = parseChannels(submitBgRaw);
  const [hr, hg, hb] = headerRGB;
  const [pr, pg, pb] = pageRGB;
  const [paR, paG, paB] = panelRGB;
  const [sr, sg, sb] = submitBg;
  expect(hb).toBeGreaterThan(hg);
  expect(hb).toBeGreaterThan(hr);
  expect(hr).toBeLessThan(hb + 1);
  const pageLum = pr + pg + pb;
  expect(pageLum).toBeGreaterThan(420);
  expect(pageLum).toBeLessThan(720);
  const panelLum = paR + paG + paB;
  expect(panelLum).toBeGreaterThanOrEqual(pageLum);
  expect(panelLum).toBeGreaterThanOrEqual(720);
  expect(sr).toBeGreaterThan(sg + 20);
  expect(sr).toBeGreaterThan(sb + 20);
  await c.username.focus();
  const outline = await c.username.evaluate(n => {
    const cs = getComputedStyle(n as Element);
    return { width: cs.outlineWidth, style: cs.outlineStyle, shadow: cs.boxShadow };
  });
  const focused = (parseFloat(outline.width) > 0 && outline.style !== 'none') || (outline.shadow !== 'none' && outline.shadow !== '');
  expect(focused).toBe(true);
  await page.setViewportSize({ width: 420, height: 800 });
  await expect(c.form).toBeVisible();
  const docW = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(docW).toBeLessThanOrEqual(420);
});
