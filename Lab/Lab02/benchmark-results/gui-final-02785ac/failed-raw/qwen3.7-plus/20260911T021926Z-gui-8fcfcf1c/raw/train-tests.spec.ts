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
  const headingText = await c.heading.textContent();
  expect(headingText).toMatch(/register|create.*account|sign up/i);
  await expect(c.form).toBeVisible();
  await expect(c.username).toBeVisible();
  await expect(c.email).toBeVisible();
  await expect(c.password).toBeVisible();
  await expect(c.confirmPassword).toBeVisible();
  await expect(c.terms).toBeVisible();
  await expect(c.submit).toBeVisible();
});

test('empty submission reports all required problems and focuses first invalid field', async ({ page }) => {
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
  const creds = uniqueRegistration();
  await fillRegistration(page, creds);
  await c.submit.click();
  await expect(successFeedback(page)).toBeVisible();
  await expect(errorSummary(page)).not.toBeVisible();
  await expect(c.username).not.toHaveAttribute('aria-invalid', 'true');
});

test.describe('field validation boundaries', () => {
  test('username boundaries', async ({ page }) => {
    const cases = [
      { value: '', valid: false },
      { value: '  ', valid: false },
      { value: 'Ab', valid: false },
      { value: 'Ab3', valid: true },
      { value: 'A'.repeat(21), valid: false },
      { value: 'A'.repeat(20) + '3', valid: false },
      { value: 'A'.repeat(19) + '3', valid: true },
      { value: '  Ab3  ', valid: true },
      { value: '1abc', valid: false },
      { value: 'a_b3', valid: true },
      { value: 'a b3', valid: false },
    ];
    for (const tc of cases) {
      await resetRegistration(page);
      const email = uniqueRegistration().email;
      await fillRegistration(page, { username: tc.value, email });
      await submitRegistration(page);
      if (tc.valid) {
        await expect(successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, 'username');
      }
    }
  });

  test('email boundaries', async ({ page }) => {
    const baseUsername = uniqueRegistration().username;
    const cases = [
      { value: '', valid: false },
      { value: 'user', valid: false },
      { value: 'user@', valid: false },
      { value: '@example.com', valid: false },
      { value: 'user@example', valid: false },
      { value: 'user@example.com', valid: true },
      { value: '  user@example.com  ', valid: true },
      { value: 'USER@EXAMPLE.COM', valid: true },
      { value: 'user @example.com', valid: false },
      { value: 'user..name@example.com', valid: false },
      { value: '.user@example.com', valid: false },
      { value: 'user.@example.com', valid: false },
      { value: 'user@.example.com', valid: false },
      { value: 'user@example-.com', valid: false },
      { value: 'user@example.c', valid: true },
      { value: 'user@a.b', valid: true },
    ];
    for (const tc of cases) {
      await resetRegistration(page);
      await fillRegistration(page, { username: baseUsername, email: tc.value });
      await submitRegistration(page);
      if (tc.valid) {
        await expect(successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, 'email');
      }
    }
  });

  test('password and confirmation boundaries', async ({ page }) => {
    const creds = uniqueRegistration();
    const cases = [
      { password: '', confirm: '', pwValid: false, match: true },
      { password: 'A1', confirm: 'A1', pwValid: false, match: true },
      { password: 'Password01', confirm: 'Password01', pwValid: true, match: true },
      { password: 'Abcdefghi1', confirm: 'Abcdefghi1', pwValid: true, match: true },
      { password: 'Password1', confirm: 'Password1', pwValid: false, match: true },
      { password: 'Abcdefgh1', confirm: 'Abcdefgh1', pwValid: false, match: true },
      { password: 'A1' + 'x'.repeat(62), confirm: 'A1' + 'x'.repeat(62), pwValid: true, match: true },
      { password: 'A1' + 'x'.repeat(63), confirm: 'A1' + 'x'.repeat(63), pwValid: false, match: true },
      { password: 'Password01', confirm: 'Different1', pwValid: true, match: false },
      { password: 'alllowercase1', confirm: 'alllowercase1', pwValid: true, match: true },
      { password: 'ALLUPPERCASE1', confirm: 'ALLUPPERCASE1', pwValid: true, match: true },
    ];
    for (const tc of cases) {
      await resetRegistration(page);
      await fillRegistration(page, { ...creds, password: tc.password, confirmPassword: tc.confirm });
      await submitRegistration(page);
      if (tc.pwValid && tc.match) {
        await expect(successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        if (!tc.pwValid) {
          await expectFieldError(page, 'password');
        }
        if (!tc.match) {
          await expectFieldError(page, 'confirmPassword');
        }
      }
    }
  });

  test('date of birth optional and valid date accepted', async ({ page }) => {
    const creds = uniqueRegistration();
    await resetRegistration(page);
    await fillRegistration(page, creds);
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();

    await resetRegistration(page);
    await fillRegistration(page, { ...creds, dateOfBirth: '1990-05-15' });
    await submitRegistration(page);
    await expect(successFeedback(page)).toBeVisible();
  });

  test('missing terms rejected', async ({ page }) => {
    const creds = uniqueRegistration();
    await resetRegistration(page);
    await fillRegistration(page, { ...creds, terms: false });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, 'terms');
  });
});

test('show/hide password toggles both fields and updates accessible name', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const creds = uniqueRegistration();
  await fillRegistration(page, creds);
  const toggle = c.passwordToggle;
  await expect(toggle).toBeVisible();
  const initialName = await toggle.getAttribute('aria-label') || await toggle.textContent();
  await toggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  const afterName = await toggle.getAttribute('aria-label') || await toggle.textContent();
  expect(afterName).not.toBe(initialName);
  await toggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
});

test('persistence stores trimmed username and lowercased email without passwords', async ({ page }) => {
  await resetRegistration(page);
  const rawUsername = '  TestUser_1  ';
  const rawEmail = '  TEST@Example.COM  ';
  const password = 'Password01';
  await fillRegistration(page, { username: rawUsername, email: rawEmail, password, confirmPassword: password });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  const corpus = await storageCorpus(page);
  const allValues = Object.values(corpus).join(' ');
  expect(allValues).toContain('TestUser_1');
  expect(allValues).toContain('test@example.com');
  expect(allValues).not.toContain(password);
  for (const key of Object.keys(corpus)) {
    expect(key.toLowerCase()).not.toContain('password');
  }
});

test('duplicate username and email rejected across reloads', async ({ page }) => {
  await resetRegistration(page);
  const creds = uniqueRegistration();
  await fillRegistration(page, creds);
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await openRegistration(page);
  await fillRegistration(page, { ...creds, password: 'Password01', confirmPassword: 'Password01' });
  await submitRegistration(page);
  await expectRejection(page);

  await page.reload();
  await fillRegistration(page, { ...creds, password: 'Password01', confirmPassword: 'Password01' });
  await submitRegistration(page);
  await expectRejection(page);
});

test('rejected attempt reserves nothing', async ({ page }) => {
  await resetRegistration(page);
  const creds = uniqueRegistration();
  await fillRegistration(page, { ...creds, password: 'short', confirmPassword: 'short' });
  await submitRegistration(page);
  await expectRejection(page);

  await fillRegistration(page, { ...creds, password: 'Password01', confirmPassword: 'Password01' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('presentation and responsive layout', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);

  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  const headerBg = await header.evaluate((el) => {
    const style = getComputedStyle(el);
    const m = style.backgroundColor.match(/\d+/g);
    return m ? { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) } : null;
  });
  expect(headerBg).not.toBeNull();
  expect(headerBg.r < 50 && headerBg.g < 50 && headerBg.b > 50).toBeTruthy();

  const body = page.locator('body');
  const bodyBg = await body.evaluate((el) => {
    const style = getComputedStyle(el);
    const m = style.backgroundColor.match(/\d+/g);
    return m ? { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) } : null;
  });
  expect(bodyBg).not.toBeNull();
  expect(bodyBg.r > 200 && bodyBg.g > 200 && bodyBg.b > 200).toBeTruthy();

  let panelBg = null;
  let target = await c.form.elementHandle();
  while (target) {
    const bg = await target.evaluate((el) => {
      const style = getComputedStyle(el);
      const m = style.backgroundColor.match(/\d+/g);
      return m ? { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) } : null;
    });
    if (bg && !(bg.r === 0 && bg.g === 0 && bg.b === 0)) {
      panelBg = bg;
      break;
    }
    target = await target.evaluateHandle((el) => el.parentElement);
  }
  if (panelBg) {
    expect(panelBg.r > 200 && panelBg.g > 200 && panelBg.b > 200).toBeTruthy();
  }

  const submitBg = await c.submit.evaluate((el) => {
    const style = getComputedStyle(el);
    const m = style.backgroundColor.match(/\d+/g);
    return m ? { r: parseInt(m[0]), g: parseInt(m[1]), b: parseInt(m[2]) } : null;
  });
  expect(submitBg).not.toBeNull();
  expect(submitBg.r > 150 && submitBg.g < 100 && submitBg.b < 100).toBeTruthy();

  await page.setViewportSize({ width: 1200, height: 800 });
  const formWidth = await c.form.evaluate((el) => el.offsetWidth);
  expect(formWidth).toBeLessThan(1100);

  await page.setViewportSize({ width: 375, height: 667 });
  const htmlEl = page.locator('html');
  const hasOverflow = await htmlEl.evaluate((el) => {
    return el.scrollWidth > el.clientWidth;
  });
  expect(hasOverflow).toBeFalsy();
  const mobileFormWidth = await c.form.evaluate((el) => el.offsetWidth);
  expect(mobileFormWidth).toBeLessThanOrEqual(375);

  await c.username.focus();
  await expect(c.username).toBeFocused();
  const focusOutline = await c.username.evaluate((el) => {
    const style = getComputedStyle(el);
    return style.outline !== 'none' || style.boxShadow !== 'none';
  });
  expect(focusOutline).toBeTruthy();
});
