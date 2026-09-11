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

test('valid submission clears stale errors and shows success', async ({ page }) => {
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
    { value: '  Ab3  ', valid: true, label: 'trimmed valid min' },
    { value: 'Ab', valid: false, label: 'too short after trim' },
    { value: '1abc', valid: false, label: 'starts with digit' },
    { value: 'a'.repeat(21), valid: false, label: 'too long' },
    { value: 'Valid_User1', valid: true, label: 'valid mixed' },
  ];

  for (const row of usernameCases) {
    await resetRegistration(page);
    const u = uniqueRegistration();
    const payload = { ...base, username: row.value, email: u.email };
    await fillRegistration(page, payload);
    await submitRegistration(page);
    if (row.valid) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, 'username');
    }
  }

  const emailCases = [
    { value: 'user@example.com', valid: true, label: 'valid' },
    { value: ' User@Example.COM ', valid: true, label: 'whitespace and case' },
    { value: 'u@a.b', valid: true, label: 'minimal domain' },
    { value: '.user@example.com', valid: false, label: 'dot bounded local' },
    { value: 'user..name@example.com', valid: false, label: 'repeated dots' },
    { value: 'user@-example.com', valid: false, label: 'hyphen bounded domain' },
    { value: 'user@example', valid: false, label: 'single label domain' },
    { value: ' @example.com', valid: false, label: 'empty local' },
  ];

  for (const row of emailCases) {
    await resetRegistration(page);
    const u = uniqueRegistration();
    const payload = { ...base, username: u.username, email: row.value };
    await fillRegistration(page, payload);
    await submitRegistration(page);
    if (row.valid) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, 'email');
    }
  }

  const passwordCases = [
    { pw: 'Password01', valid: true, label: 'valid min length' },
    { pw: 'Abcdefghi1', valid: true, label: 'valid mixed case' },
    { pw: 'Pass1', valid: false, label: 'too short' },
    { pw: 'abcdefghij', valid: false, label: 'no digit' },
    { pw: '1234567890', valid: false, label: 'no letter' },
    { pw: 'A1' + 'x'.repeat(62), valid: true, label: 'max length 64' },
    { pw: 'A1' + 'x'.repeat(63), valid: false, label: 'too long 65' },
  ];

  for (const row of passwordCases) {
    await resetRegistration(page);
    const u = uniqueRegistration();
    const payload = { ...base, username: u.username, email: u.email, password: row.pw };
    await fillRegistration(page, payload);
    await submitRegistration(page);
    if (row.valid) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, 'password');
    }
  }

  await resetRegistration(page);
  const u1 = uniqueRegistration();
  await fillRegistration(page, { ...u1, password: 'Password01', confirmPassword: 'Password02' });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'confirmPassword');
});

test('missing terms rejection', async ({ page }) => {
  await resetRegistration(page);
  const data = uniqueRegistration();
  await fillRegistration(page, { ...data, terms: false });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'terms');
});

test('optional date of birth', async ({ page }) => {
  await resetRegistration(page);
  const data = uniqueRegistration();
  await fillRegistration(page, { ...data, dateOfBirth: '1990-05-15' });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await resetRegistration(page);
  const data2 = uniqueRegistration();
  await fillRegistration(page, data2);
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('show hide password toggle', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const data = uniqueRegistration();
  await fillRegistration(page, data);
  const toggle = c.passwordToggle;
  await expect(toggle).toBeVisible();
  
  const initialType = await c.password.getAttribute('type');
  expect(initialType).toBe('password');
  
  await toggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  
  const ariaLabel = await toggle.getAttribute('aria-label');
  const ariaPressed = await toggle.getAttribute('aria-pressed');
  const accessibleName = await toggle.textContent();
  expect(ariaLabel || ariaPressed || accessibleName).toBeTruthy();
  
  await toggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
});

test('persistence and duplicate handling', async ({ page }) => {
  await resetRegistration(page);
  const data = uniqueRegistration();
  const paddedUsername = '  ' + data.username + '  ';
  const upperEmail = data.email.toUpperCase();
  const testPassword = 'Password01';
  
  await fillRegistration(page, { ...data, username: paddedUsername, email: upperEmail, password: testPassword });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  const corpus = await storageCorpus(page);
  const values = Object.values(corpus).join(' ');
  expect(values.toLowerCase()).toContain(data.username.toLowerCase());
  expect(values.toLowerCase()).toContain(data.email.toLowerCase());
  expect(values).not.toContain(testPassword);
  const keys = Object.keys(corpus);
  for (const k of keys) {
    expect(k.toLowerCase()).not.toContain('password');
  }

  await openRegistration(page);
  await fillRegistration(page, { ...data, username: '  ' + data.username + '  ', email: data.email, password: testPassword });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'username');

  await openRegistration(page);
  await fillRegistration(page, { ...data, username: data.username, email: '  ' + data.email.toUpperCase() + '  ', password: testPassword });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, 'email');

  await resetRegistration(page);
  const rejectedData = uniqueRegistration();
  await fillRegistration(page, { ...rejectedData, password: 'short' });
  await submitRegistration(page);
  await expectRejection(page);

  await openRegistration(page);
  await fillRegistration(page, { ...rejectedData, password: testPassword });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('presentation and responsive layout', async ({ page }) => {
  await resetRegistration(page);
  const c = controls(page);
  const header = page.locator('header').first();
  await expect(header).toBeVisible();
  const headerColor = await header.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.backgroundColor;
  });
  const rgb = headerColor.match(/\d+/g);
  if (rgb) {
    const r = parseInt(rgb[0], 10);
    const g = parseInt(rgb[1], 10);
    const b = parseInt(rgb[2], 10);
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g);
    expect(r < 50 && g < 50 && b < 100).toBeTruthy();
  }

  const bodyBg = await page.evaluate(() => {
    const style = window.getComputedStyle(document.body);
    return style.backgroundColor;
  });
  const bodyRgb = bodyBg.match(/\d+/g);
  if (bodyRgb) {
    const r = parseInt(bodyRgb[0], 10);
    const g = parseInt(bodyRgb[1], 10);
    const b = parseInt(bodyRgb[2], 10);
    expect(r > 200 && g > 200 && b > 200).toBeTruthy();
  }

  let panel = c.form;
  let panelBg = await panel.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  let panelRgb = panelBg.match(/\d+/g);
  
  if (!panelRgb || !(parseInt(panelRgb[0]) > 240 && parseInt(panelRgb[1]) > 240 && parseInt(panelRgb[2]) > 240)) {
    const parent = c.form.locator('..');
    panelBg = await parent.evaluate((el) => window.getComputedStyle(el).backgroundColor);
    panelRgb = panelBg.match(/\d+/g);
    if (panelRgb && parseInt(panelRgb[0]) > 240 && parseInt(panelRgb[1]) > 240 && parseInt(panelRgb[2]) > 240) {
      panel = parent;
    } else {
      const grandParent = c.form.locator('..').locator('..');
      panelBg = await grandParent.evaluate((el) => window.getComputedStyle(el).backgroundColor);
      panelRgb = panelBg.match(/\d+/g);
      if (panelRgb && parseInt(panelRgb[0]) > 240 && parseInt(panelRgb[1]) > 240 && parseInt(panelRgb[2]) > 240) {
        panel = grandParent;
      }
    }
  }
  
  if (panelRgb) {
    const r = parseInt(panelRgb[0], 10);
    const g = parseInt(panelRgb[1], 10);
    const b = parseInt(panelRgb[2], 10);
    expect(r > 240 && g > 240 && b > 240).toBeTruthy();
  }

  const submitColor = await c.submit.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.backgroundColor;
  });
  const submitRgb = submitColor.match(/\d+/g);
  if (submitRgb) {
    const r = parseInt(submitRgb[0], 10);
    const g = parseInt(submitRgb[1], 10);
    const b = parseInt(submitRgb[2], 10);
    expect(r > g && r > b).toBeTruthy();
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  const formBox = await c.form.boundingBox();
  if (formBox) {
    expect(formBox.x).toBeGreaterThan(0);
  }

  await page.setViewportSize({ width: 375, height: 667 });
  const html = page.locator('html');
  const scrollWidth = await html.evaluate((el) => el.scrollWidth);
  const clientWidth = await html.evaluate((el) => el.clientWidth);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

  await c.username.focus();
  const focusOutline = await c.username.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.outlineStyle;
  });
  const focusBoxShadow = await c.username.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.boxShadow;
  });
  const focusBorder = await c.username.evaluate((el) => {
    const style = window.getComputedStyle(el);
    return style.borderStyle;
  });
  expect(focusOutline !== 'none' || focusBoxShadow !== 'none' || focusBorder !== 'none').toBeTruthy();
});
