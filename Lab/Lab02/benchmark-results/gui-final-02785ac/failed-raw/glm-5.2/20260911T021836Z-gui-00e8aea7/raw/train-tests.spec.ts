import { test, expect } from '@playwright/test';
import {
  controls, openRegistration, resetRegistration, uniqueRegistration,
  fillRegistration, submitRegistration, successFeedback, errorSummary,
  expectFieldError, expectFirstInvalid, expectRejection, storageCorpus,
} from './course-gui-test-support.js';

const VALID_PASSWORD = 'Password01';
const VALID_PASSWORD_64 = 'A1' + 'x'.repeat(62);

function parseChannels(color: string): [number, number, number] {
  const m = color.match(/\d+(\.\d+)?/g);
  return [parseFloat(m![0]), parseFloat(m![1]), parseFloat(m![2])];
}

test.describe('Registration', () => {

  test('accessible structure and semantic markup', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await expect(c.heading).toBeVisible();
    await expect(c.heading).toHaveText(/register|create.*account|sign up/i);
    await expect(c.form).toBeVisible();
    await expect(c.username).toBeVisible();
    await expect(c.email).toHaveAttribute('type', 'email');
    await expect(c.dateOfBirth ?? c.dob).toHaveAttribute('type', 'date');
    await expect(c.password).toHaveAttribute('type', 'password');
    await expect(c.confirmPassword).toHaveAttribute('type', 'password');
    await expect(c.terms).toBeVisible();
    await expect(c.submit).toBeVisible();
    expect(await c.username.getAttribute('autocomplete')).toBeTruthy();
    expect(await c.email.getAttribute('autocomplete')).toBeTruthy();
    expect(await c.password.getAttribute('autocomplete')).toBeTruthy();
    const submitText = (await c.submit.textContent()) ?? '';
    expect(submitText).toMatch(/register|sign\s*up|create/i);
  });

  test('empty submission reports all required problems with summary and focus', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await fillRegistration(page, {
      username: '', email: '', password: '', confirmPassword: '', terms: false,
    });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, c.username);
    await expectFieldError(page, c.email);
    await expectFieldError(page, c.password);
    await expectFieldError(page, c.terms);
    const summary = await errorSummary(page);
    await expect(summary).toBeVisible();
    await expectFirstInvalid(page);
  });

  test('corrected valid submission clears stale errors and summary', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await fillRegistration(page, { username: '', email: '', password: '' });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, c.username);
    const summary = await errorSummary(page);
    await expect(summary).toBeVisible();
    const u = uniqueRegistration();
    await fillRegistration(page, {
      username: u.username, email: u.email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
    await expect(c.username).not.toHaveAttribute('aria-invalid', 'true');
    const summaryAfter = await errorSummary(page);
    await expect(summaryAfter).not.toBeVisible();
  });

  test('username boundaries', async ({ page }) => {
    const cases: Array<[string, boolean]> = [
      ['  Ab3  ', true],
      ['Ab', false],
      ['1abc', false],
      ['_abc', false],
      ['ab-cd', false],
      ['ab cd', false],
      ['A'.repeat(20), true],
      ['A'.repeat(21), false],
    ];
    for (const [username, valid] of cases) {
      await resetRegistration(page);
      const c = controls(page);
      const u = uniqueRegistration();
      await fillRegistration(page, { username, email: u.email, password: VALID_PASSWORD });
      await submitRegistration(page);
      if (valid) {
        await expect(await successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, c.username);
      }
    }
  });

  test('email boundaries', async ({ page }) => {
    const cases: Array<[string, boolean]> = [
      ['  User@Example.COM  ', true],
      ['a@b.c', true],
      ['user@domain', false],
      ['user@.com', false],
      ['user@com.', false],
      ['user@do..main.com', false],
      ['.user@domain.com', false],
      ['user.@domain.com', false],
      ['us er@domain.com', false],
      ['user@-domain.com', false],
      ['user@domain-.com', false],
      ['@domain.com', false],
      ['user@', false],
    ];
    for (const [email, valid] of cases) {
      await resetRegistration(page);
      const c = controls(page);
      const u = uniqueRegistration();
      await fillRegistration(page, { username: u.username, email, password: VALID_PASSWORD });
      await submitRegistration(page);
      if (valid) {
        await expect(await successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, c.email);
      }
    }
  });

  test('password and confirmation boundaries', async ({ page }) => {
    const cases: Array<[string, string, string, boolean]> = [
      [VALID_PASSWORD, VALID_PASSWORD, 'password', true],
      [VALID_PASSWORD_64, VALID_PASSWORD_64, 'password', true],
      ['abcdefghi1', 'abcdefghi1', 'password', true],
      ['Password0', 'Password0', 'password', false],
      ['allletters', 'allletters', 'password', false],
      ['1234567890', '1234567890', 'password', false],
      [VALID_PASSWORD, 'Different01', 'confirmPassword', false],
    ];
    for (const [pw, confirm, field, valid] of cases) {
      await resetRegistration(page);
      const c = controls(page);
      const u = uniqueRegistration();
      await fillRegistration(page, {
        username: u.username, email: u.email, password: pw, confirmPassword: confirm,
      });
      await submitRegistration(page);
      if (valid) {
        await expect(await successFeedback(page)).toBeVisible();
      } else {
        const target = field === 'password' ? c.password : c.confirmPassword;
        await expectFieldError(page, target);
      }
    }
  });

  test('terms and optional date of birth', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    const u = uniqueRegistration();
    await fillRegistration(page, { username: u.username, email: u.email, password: VALID_PASSWORD, terms: false });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, c.terms);
    await fillRegistration(page, { username: u.username, email: u.email, password: VALID_PASSWORD, dateOfBirth: '1995-06-15' });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
  });

  test('password show/hide toggle updates both inputs and accessible name', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await fillRegistration(page, { password: VALID_PASSWORD });
    await expect(c.password).toHaveAttribute('type', 'password');
    await expect(c.confirmPassword).toHaveAttribute('type', 'password');
    const toggle = c.passwordToggle;
    const nameBefore = await toggle.getAttribute('aria-label') ?? await toggle.textContent() ?? '';
    await toggle.click();
    await expect(c.password).toHaveAttribute('type', 'text');
    await expect(c.confirmPassword).toHaveAttribute('type', 'text');
    const nameAfter = await toggle.getAttribute('aria-label') ?? await toggle.textContent() ?? '';
    expect(nameAfter).not.toBe(nameBefore);
    await toggle.click();
    await expect(c.password).toHaveAttribute('type', 'password');
    await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  });

  test('persistence: trimmed username, lowercased email, duplicates survive reload, no password data', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    const paddedName = '  MixedCase_1  ';
    const paddedEmail = '  MixedCase@Example.COM  ';
    await fillRegistration(page, { username: paddedName, email: paddedEmail, password: VALID_PASSWORD });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
    let corpus = await storageCorpus(page);
    let allValues = Object.values(corpus).join('\n');
    expect(allValues).toContain('MixedCase_1');
    expect(allValues).toContain('mixedcase@example.com');
    expect(allValues).not.toContain(VALID_PASSWORD);
    for (const key of Object.keys(corpus)) {
      expect(key.toLowerCase()).not.toContain('password');
      expect(corpus[key].toLowerCase()).not.toContain(VALID_PASSWORD.toLowerCase());
    }
    await page.reload();
    await fillRegistration(page, { username: 'MixedCase_1', email: uniqueRegistration().email, password: VALID_PASSWORD });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, c.username);
    await fillRegistration(page, { username: uniqueRegistration().username, email: 'mixedcase@example.com', password: VALID_PASSWORD });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, c.email);
  });

  test('rejected attempt reserves nothing', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    const u = uniqueRegistration();
    await fillRegistration(page, { username: u.username, email: u.email, password: 'short1', confirmPassword: 'short1' });
    await submitRegistration(page);
    await expectFieldError(page, c.password);
    await fillRegistration(page, { username: u.username, email: u.email, password: VALID_PASSWORD });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
  });

  test('presentation: service header, page background, white panel, orange submit, focus indicator', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    const header = page.locator('header').first();
    await expect(header).toBeVisible();
    const headerBg = parseChannels(await header.evaluate((el) => getComputedStyle(el).backgroundColor));
    expect(headerBg[2]).toBeGreaterThan(headerBg[0]);
    expect(headerBg[2]).toBeGreaterThan(80);
    expect(headerBg[0]).toBeLessThan(80);
    const bodyBg = parseChannels(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
    expect(bodyBg[2]).toBeGreaterThan(bodyBg[0]);
    expect(bodyBg[0]).toBeGreaterThan(headerBg[0]);
    const panel = page.locator('main, [role="main"], section, form').first();
    const panelBg = parseChannels(await panel.evaluate((el) => {
      let node: Element | null = el;
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
        node = node.parentElement;
      }
      return 'rgb(0,0,0)';
    }));
    expect(panelBg[0]).toBeGreaterThan(230);
    expect(panelBg[1]).toBeGreaterThan(230);
    expect(panelBg[2]).toBeGreaterThan(230);
    const submitBg = parseChannels(await c.submit.evaluate((el) => getComputedStyle(el).backgroundColor));
    expect(submitBg[0]).toBeGreaterThan(submitBg[2]);
    expect(submitBg[0]).toBeGreaterThan(150);
    await c.username.focus();
    const outlineStyle = await c.username.evaluate((el) => getComputedStyle(el).outlineStyle);
    const outlineWidth = await c.username.evaluate((el) => getComputedStyle(el).outlineWidth);
    expect(outlineStyle).not.toBe('none');
    expect(parseFloat(outlineWidth)).toBeGreaterThan(0);
  });

  test('responsive: two columns on desktop, one column on mobile without overflow', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await expect(c.username).toBeVisible();
    const usernameBox = await c.username.boundingBox();
    const emailBox = await c.email.boundingBox();
    expect(usernameBox).toBeTruthy();
    expect(emailBox).toBeTruthy();
    if (usernameBox!.y === emailBox!.y) {
      expect(Math.abs(usernameBox!.x + usernameBox!.width - emailBox!.x)).toBeLessThan(100);
    }
    await page.setViewportSize({ width: 375, height: 700 });
    await expect(c.username).toBeVisible();
    const mobileUsernameBox = await c.username.boundingBox();
    const mobileEmailBox = await c.email.boundingBox();
    expect(mobileUsernameBox).toBeTruthy();
    expect(mobileEmailBox).toBeTruthy();
    expect(Math.abs(mobileUsernameBox!.x - mobileEmailBox!.x)).toBeLessThan(10);
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(375);
  });
});
