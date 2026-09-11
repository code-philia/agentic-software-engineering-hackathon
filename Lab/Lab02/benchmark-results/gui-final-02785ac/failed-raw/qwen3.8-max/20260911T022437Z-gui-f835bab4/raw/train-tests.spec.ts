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

test('accessible structure and semantic markup', async ({ page }) => {
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
  await c(page).submit.click();
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
  await c(page).submit.click();
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
    { label: 'too short after trim', value: '  Ab  ', valid: false },
    { label: 'too long 21 chars', value: 'A' + 'b'.repeat(19) + '3', valid: false },
    { label: 'starts with digit', value: '3Abcdefgh', valid: false },
    { label: 'contains space', value: 'Ab cd', valid: false },
    { label: 'contains hyphen', value: 'Ab-cd', valid: false },
    { label: 'underscore allowed', value: 'Ab_cd', valid: true },
    { label: 'whitespace trimmed', value: '  ValidUser1  ', valid: true },
  ];

  for (const r of rows) {
    test(`username: ${r.label}`, async ({ page }) => {
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
});

test.describe('email boundaries', () => {
  const rows: { label: string; value: string; valid: boolean }[] = [
    { label: 'valid simple', value: 'a@b.c', valid: true },
    { label: 'single letter tld', value: 'user@example.a', valid: true },
    { label: 'multi-label domain', value: 'u@a.b.c', valid: true },
    { label: 'missing at', value: 'userexample.com', valid: false },
    { label: 'missing domain', value: 'user@', valid: false },
    { label: 'missing local', value: '@example.com', valid: false },
    { label: 'leading dot local', value: '.user@example.com', valid: false },
    { label: 'trailing dot local', value: 'user.@example.com', valid: false },
    { label: 'consecutive dots local', value: 'us..er@example.com', valid: false },
    { label: 'hyphen bounded label', value: 'user@-example.com', valid: false },
    { label: 'trailing hyphen label', value: 'user@example-.com', valid: false },
    { label: 'whitespace in email', value: 'u ser@example.com', valid: false },
    { label: 'normalized lowercase', value: 'USER@Example.COM', valid: true },
  ];

  for (const r of rows) {
    test(`email: ${r.label}`, async ({ page }) => {
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
});

test.describe('password and confirmation boundaries', () => {
  const rows: { label: string; pw: string; confirm?: string; field: string; valid: boolean }[] = [
    { label: 'min valid 10 chars', pw: 'Password01', field: 'password', valid: true },
    { label: 'max valid 64 chars', pw: 'A1' + 'x'.repeat(62), field: 'password', valid: true },
    { label: 'too short 9 chars', pw: 'Abcdefgh1', field: 'password', valid: false },
    { label: 'no digit', pw: 'Abcdefghij', field: 'password', valid: false },
    { label: 'no letter', pw: '1234567890', field: 'password', valid: false },
    { label: 'lowercase only with digit', pw: 'abcdefghi1', field: 'password', valid: true },
    { label: 'uppercase only with digit', pw: 'ABCDEFGHI1', field: 'password', valid: true },
    { label: 'mismatch confirmation', pw: 'Password01', confirm: 'Password02', field: 'confirmPassword', valid: false },
  ];

  for (const r of rows) {
    test(`password: ${r.label}`, async ({ page }) => {
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

test('missing terms is rejected', async ({ page }) => {
  await resetRegistration(page);
  await fillRegistration(page, { terms: false });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'terms');
});

test('optional date of birth accepts real date and omission', async ({ page }) => {
  await resetRegistration(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email, dateOfBirth: '2000-02-29' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await resetRegistration(page);
  const id2 = uniqueRegistration();
  await fillRegistration(page, { username: id2.username, email: id2.email });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('show/hide password toggle updates both fields and accessible name', async ({ page }) => {
  const c = controls(page);
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  await expect(c.passwordToggle).toHaveAccessibleName(/hide/i);
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await expect(c.passwordToggle).toHaveAccessibleName(/show/i);
});

test('persistence: trimmed username, lowered email, no passwords, duplicates survive reload', async ({ page }) => {
  await resetRegistration(page);
  const id = uniqueRegistration();
  const paddedUser = '  ' + id.username + '  ';
  const mixedEmail = 'MiXeD@Example.COM';
  const knownPw = 'Password01';
  await fillRegistration(page, { username: paddedUser, email: mixedEmail, password: knownPw });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  const store = await storageCorpus(page);
  const vals = Object.values(store).join(' ');
  expect(vals).toContain(id.username.trim());
  expect(vals).toContain('mixed@example.com');
  expect(vals).not.toContain(knownPw);
  expect(Object.keys(store).some(k => /password/i.test(k))).toBeFalsy();

  await page.reload();
  const id2 = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id2.email });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'username');

  const id3 = uniqueRegistration();
  await fillRegistration(page, { username: id3.username, email: mixedEmail });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'email');
});

test('rejected attempt reserves nothing; fixing companion allows same identifiers', async ({ page }) => {
  await resetRegistration(page);
  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email, password: 'short1', confirmPassword: 'short1' });
  await submitRegistration(page);
  await expectRejection(page);

  await fillRegistration(page, { username: id.username, email: id.email, password: 'Password01' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('presentation: header, background, panel, accent, responsive layout, focus indicator', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);

  const header = page.locator('header').first();
  const hBg = await header.evaluate(el => getComputedStyle(el).backgroundColor);
  const hRgb = hBg.match(/\d+/g)!.map(Number);
  expect(hRgb[2]).toBeGreaterThan(hRgb[0]);
  expect(hRgb[2]).toBeGreaterThan(100);

  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const bRgb = bodyBg.match(/\d+/g)!.map(Number);
  expect(bRgb[0]).toBeGreaterThan(180);
  expect(bRgb[1]).toBeGreaterThan(180);
  expect(bRgb[2]).toBeGreaterThan(180);

  const panel = c.form.locator('..');
  const pBg = await panel.evaluate(el => {
    let cur: HTMLElement | null = el;
    while (cur) {
      const bg = getComputedStyle(cur).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
      cur = cur.parentElement;
    }
    return '';
  });
  const pRgb = pBg.match(/\d+/g)!.map(Number);
  expect(pRgb[0]).toBeGreaterThan(240);
  expect(pRgb[1]).toBeGreaterThan(240);
  expect(pRgb[2]).toBeGreaterThan(240);

  const subColor = await c.submit.evaluate(el => getComputedStyle(el).backgroundColor);
  const sRgb = subColor.match(/\d+/g)!.map(Number);
  expect(sRgb[0]).toBeGreaterThan(sRgb[1]);
  expect(sRgb[0]).toBeGreaterThan(sRgb[2]);

  await page.setViewportSize({ width: 1200, height: 800 });
  const uBox = await c.username.boundingBox();
  const eBox = await c.email.boundingBox();
  if (uBox && eBox) {
    expect(Math.abs(uBox.y - eBox.y)).toBeLessThan(20);
  }

  await page.setViewportSize({ width: 360, height: 640 });
  const uBox2 = await c.username.boundingBox();
  const eBox2 = await c.email.boundingBox();
  if (uBox2 && eBox2) {
    expect(eBox2.y).toBeGreaterThan(uBox2.y + uBox2.height);
  }
  const formBox = await c.form.boundingBox();
  expect(formBox!.width).toBeLessThanOrEqual(360);

  await c.username.focus();
  const outline = await c.username.evaluate(el => {
    const s = getComputedStyle(el);
    return s.outlineWidth !== '0px' || s.boxShadow !== 'none';
  });
  expect(outline).toBeTruthy();
});

function c(page: import('@playwright/test').Page) {
  return controls(page);
}
