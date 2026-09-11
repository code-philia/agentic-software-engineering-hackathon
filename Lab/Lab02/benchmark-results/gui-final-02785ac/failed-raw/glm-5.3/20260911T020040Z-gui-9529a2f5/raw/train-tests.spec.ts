import { test, expect, Page } from '@playwright/test';
import {
  controls, openRegistration, resetRegistration, uniqueRegistration,
  fillRegistration, submitRegistration, successFeedback, errorSummary,
  expectFieldError, expectFirstInvalid, expectRejection, storageCorpus,
} from './course-gui-test-support.js';

const VALID_PASSWORD = 'Password01';

function channels(c: string | null): number[] {
  const m = (c || '').match(/\d+/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}

async function bg(el: { evaluate: (fn: (e: HTMLElement) => string) => Promise<string> }) {
  return el.evaluate((e) => getComputedStyle(e).backgroundColor);
}

async function visibleBg(page: Page, el: { evaluateHandle: (fn: (e: HTMLElement) => HTMLElement) => unknown }) {
  const handle = await el.evaluateHandle((e: HTMLElement) => e);
  return page.evaluate((node: HTMLElement | null) => {
    while (node) {
      const s = getComputedStyle(node).backgroundColor;
      const m = s.match(/\d+/g);
      if (m && Number(m[3]) > 0 && !(Number(m[0]) === 0 && Number(m[1]) === 0 && Number(m[2]) === 0)) return s;
      node = node.parentElement;
    }
    return '';
  }, handle as unknown as HTMLElement | null);
}

async function bodyBg(page: Page) {
  return page.evaluate(() => {
    let el: HTMLElement | null = document.body;
    while (el) {
      const s = getComputedStyle(el).backgroundColor;
      const m = s.match(/\d+/g);
      if (m && Number(m[3]) > 0 && !(Number(m[0]) === 0 && Number(m[1]) === 0 && Number(m[2]) === 0)) return s;
      el = el.parentElement;
    }
    return '';
  });
}

test.describe('registration', () => {
  test('accessible structure', async ({ page }) => {
    await openRegistration(page);
    const c = controls(page);
    await expect(c.heading).toHaveText(/register|create.*account|sign up/i);
    await expect(c.form).toBeVisible();
    await expect(c.username).toHaveAccessibleName(/username/i);
    await expect(c.email).toHaveAccessibleName(/email/i);
    await expect(c.password).toHaveAccessibleName(/password/i);
    await expect(c.confirmPassword).toHaveAccessibleName(/confirm/i);
    await expect(c.terms).toHaveAccessibleName(/terms/i);
    await expect(c.submit).toHaveAccessibleName(/register|create|sign up|submit/i);
    await expect(c.email).toHaveAttribute('type', 'email');
    await expect(c.password).toHaveAttribute('type', 'password');
    await expect(c.confirmPassword).toHaveAttribute('type', 'password');
    await expect(c.username).toHaveAttribute('autocomplete', /username/i);
    await expect(c.email).toHaveAttribute('autocomplete', /email/i);
    await expect(c.password).toHaveAttribute('autocomplete', /new-password/i);
    await expect(c.dateOfBirth).toHaveAttribute('type', 'date');
  });

  test('empty submission reports all problems, summary, and focus', async ({ page }) => {
    await resetRegistration(page);
    await openRegistration(page);
    const c = controls(page);
    await fillRegistration(page, { terms: false });
    await c.username.fill('');
    await c.email.fill('');
    await c.password.fill('');
    await c.confirmPassword.fill('');
    await submitRegistration(page);
    await expect(errorSummary(page)).toBeVisible();
    await expectFieldError(page, 'username');
    await expectFieldError(page, 'email');
    await expectFieldError(page, 'password');
    await expectFieldError(page, 'confirmPassword');
    await expectFieldError(page, 'terms');
    await expectFirstInvalid(page, 'username');
    for (const f of [c.username, c.email, c.password, c.confirmPassword]) {
      const desc = await f.getAttribute('aria-describedby');
      expect(desc, 'invalid control should reference its explanation').toBeTruthy();
    }
  });

  test('corrected submission clears stale errors and succeeds', async ({ page }) => {
    await resetRegistration(page);
    await openRegistration(page);
    await fillRegistration(page, { terms: false });
    await submitRegistration(page);
    await expect(errorSummary(page)).toBeVisible();
    await fillRegistration(page, { password: VALID_PASSWORD });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
    await expect(errorSummary(page)).toHaveCount(0);
    await expectFieldError(page, 'terms', /^$/);
  });

  test('invalid field policy boundaries', async ({ page }) => {
    await resetRegistration(page);
    await openRegistration(page);
    const rows: Array<{ fill: Record<string, unknown>; field: Parameters<typeof expectFieldError>[1] }> = [
      { fill: { username: '  Ab  ' }, field: 'username' },
      { fill: { username: 'Ab3'.padEnd(21, '_') }, field: 'username' },
      { fill: { username: '1abc' }, field: 'username' },
      { fill: { email: 'user@' }, field: 'email' },
      { fill: { email: 'a..b@example.com' }, field: 'email' },
      { fill: { email: '.abc@example.com' }, field: 'email' },
      { fill: { email: 'abc@-example.com' }, field: 'email' },
      { fill: { password: 'Abcdefgh1' }, field: 'password' },
      { fill: { password: 'A1' + 'x'.repeat(63) }, field: 'password' },
      { fill: { password: 'abcdefghij' }, field: 'password' },
      { fill: { password: VALID_PASSWORD, confirmPassword: 'Password02' }, field: 'confirmPassword' },
      { fill: { terms: false }, field: 'terms' },
    ];
    for (const row of rows) {
      await fillRegistration(page, row.fill);
      await submitRegistration(page);
      await expectRejection(page);
      await expectFieldError(page, row.field);
    }
  });

  test('valid field policy boundaries', async ({ page }) => {
    const rows: Array<Record<string, unknown>> = [
      { username: 'Ab3' },
      { username: 'Ab3'.padEnd(20, '_') },
      { email: uniqueRegistration().username.toLowerCase() + '@example.a' },
      { password: 'Abcdefghi1' },
      { password: 'A1' + 'x'.repeat(62) },
      { password: 'alllowercase1' },
      { dateOfBirth: '2000-02-29' },
    ];
    for (const row of rows) {
      await resetRegistration(page);
      await openRegistration(page);
      await fillRegistration(page, { ...row, email: row.email ?? uniqueRegistration().email });
      await submitRegistration(page);
      await expect(successFeedback(page)).toBeVisible();
    }
  });

  test('password show/hide toggles both fields and accessible name', async ({ page }) => {
    await resetRegistration(page);
    await openRegistration(page);
    const c = controls(page);
    await fillRegistration(page, { password: VALID_PASSWORD });
    expect(await c.password.getAttribute('type')).toBe('password');
    const toggleName = () =>
      c.passwordToggle.evaluate((el) => (el.getAttribute('aria-label') || el.textContent || '').trim());
    const nameBefore = await toggleName();
    await c.passwordToggle.click();
    expect(await c.password.getAttribute('type')).toBe('text');
    expect(await c.confirmPassword.getAttribute('type')).toBe('text');
    const nameAfter = await toggleName();
    expect(nameAfter.toLowerCase()).not.toBe(nameBefore.toLowerCase());
    await c.passwordToggle.click();
    expect(await c.password.getAttribute('type')).toBe('password');
    expect(await c.confirmPassword.getAttribute('type')).toBe('password');
  });

  test('persistence: trimmed username, lowercased email, duplicates across reload, no password stored', async ({ page }) => {
    await resetRegistration(page);
    await openRegistration(page);
    const id = uniqueRegistration();
    await fillRegistration(page, {
      username: `  ${id.username}  `,
      email: id.email.toUpperCase(),
      password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
    await page.reload();
    await openRegistration(page);
    const corpus = await storageCorpus(page);
    const text = Object.values(corpus).join('\n');
    expect(text).toContain(id.username);
    expect(text).toContain(id.email.toLowerCase());
    expect(text).not.toContain(id.email.toUpperCase());
    expect(text).not.toContain(VALID_PASSWORD);
    for (const [k, v] of Object.entries(corpus)) {
      expect(k.toLowerCase()).not.toContain('password');
      expect(v.toLowerCase()).not.toContain('password":');
    }
    await fillRegistration(page, { username: id.username.toUpperCase(), email: uniqueRegistration().email, password: VALID_PASSWORD });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'username', /duplicate|already|taken|exists/i);
    await page.reload();
    await openRegistration(page);
    await fillRegistration(page, { username: uniqueRegistration().username, email: id.email, password: VALID_PASSWORD });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'email', /duplicate|already|taken|exists/i);
  });

  test('rejected attempt reserves nothing; same identifiers succeed after fix', async ({ page }) => {
    await resetRegistration(page);
    await openRegistration(page);
    const id = uniqueRegistration();
    await fillRegistration(page, { username: id.username, email: id.email, password: 'short1', terms: true });
    await submitRegistration(page);
    await expectRejection(page);
    await page.reload();
    await openRegistration(page);
    await fillRegistration(page, { username: id.username, email: id.email, password: VALID_PASSWORD });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
  });

  test('presentation and responsive layout', async ({ page }) => {
    await resetRegistration(page);
    await openRegistration(page);
    const c = controls(page);
    const header = page.locator('header, [role="banner"]').first();
    await expect(header).toBeVisible();
    const box = await header.boundingBox();
    expect(box).not.toBeNull();
    const pageWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(box!.width).toBeGreaterThanOrEqual(pageWidth - 2);
    const [hr, hg, hb] = channels(await bg(header));
    expect(hb).toBeGreaterThan(100);
    expect(hb).toBeGreaterThan(hr);
    expect(hr).toBeLessThan(80);
    const [br, , bb] = channels(await bodyBg(page));
    expect(bb).toBeGreaterThanOrEqual(br);
    expect(br).toBeGreaterThan(150);
    const [pr, pg, pb] = channels(await visibleBg(page, c.form));
    expect(pr).toBeGreaterThan(230);
    expect(pg).toBeGreaterThan(230);
    expect(pb).toBeGreaterThan(230);
    const [sr, , sb] = channels(await bg(c.submit));
    expect(sr).toBeGreaterThan(150);
    expect(sr).toBeGreaterThan(sb);
    await page.setViewportSize({ width: 1200, height: 900 });
    const userBox = await c.username.boundingBox();
    const emailBox = await c.email.boundingBox();
    expect(userBox && emailBox ? Math.abs(userBox.y - emailBox.y) < 40 : true).toBeTruthy();
    await page.setViewportSize({ width: 375, height: 800 });
    await expect(c.form).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    const uBox = await c.username.boundingBox();
    const eBox = await c.email.boundingBox();
    expect(uBox && eBox ? eBox.y > uBox.y : true).toBeTruthy();
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.outlineStyle !== 'none' || s.boxShadow !== 'none' || s.outlineWidth !== '0px';
    });
    expect(focused).toBeTruthy();
  });
});
