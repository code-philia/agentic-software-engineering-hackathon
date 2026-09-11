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

const BASE_URL = process.env.COURSE_GUI_BASE_URL!;
const SENSITIVE_PASSWORD = 'Password01';

async function gotoRegistration(page: import('@playwright/test').Page) {
  await page.goto(BASE_URL);
  await openRegistration(page);
}

function rgbChannels(value: string) {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map(s => parseFloat(s.trim()));
  return { r: parts[0], g: parts[1], b: parts[2] };
}

test.describe.configure({ mode: 'serial' });

test('accessible structure, autocomplete metadata, and toggleable password fields', async ({ page }) => {
  await gotoRegistration(page);
  const c = controls(page);
  await expect(c.heading).toBeVisible();
  await expect(c.heading).toHaveText(/register|create.*account|sign up/i);
  await expect(c.form).toBeVisible();

  await expect(c.username).toHaveAttribute('autocomplete', 'username');
  await expect(c.email).toHaveAttribute('autocomplete', 'email');
  await expect(c.dateOfBirth).toHaveAttribute('autocomplete', 'bday');
  await expect(c.password).toHaveAttribute('autocomplete', 'new-password');
  await expect(c.confirmPassword).toHaveAttribute('autocomplete', 'new-password');
  await expect(c.dateOfBirth).toHaveAttribute('type', /date|text/);

  const ariaName = await c.passwordToggle.getAttribute('aria-label');
  const toggleText = (await c.passwordToggle.textContent())?.trim() ?? '';
  expect(ariaName || toggleText).toMatch(/show|hide/i);

  await expect(c.password).toHaveAttribute('type', 'password');
  await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'text');
  await expect(c.confirmPassword).toHaveAttribute('type', 'text');
  const newAria = (await c.passwordToggle.getAttribute('aria-label')) ?? toggleText;
  expect(newAria).not.toEqual(ariaName);
  await c.passwordToggle.click();
  await expect(c.password).toHaveAttribute('type', 'password');
});

test('empty submission reports every required problem, focuses first invalid field, and clears on correction', async ({ page }) => {
  await gotoRegistration(page);
  await resetRegistration(page);
  const c = controls(page);
  await submitRegistration(page);
  await expect(errorSummary(page)).toBeVisible();
  await expectRejection(page);
  await expectFieldError(page, c.username);
  await expectFieldError(page, c.email);
  await expectFieldError(page, c.password);
  await expectFieldError(page, c.confirmPassword);
  await expect(c.terms).toHaveAttribute('aria-invalid', 'true');
  await expectFirstInvalid(page, c.username);

  const id = uniqueRegistration();
  await fillRegistration(page, { username: id.username, email: id.email, password: SENSITIVE_PASSWORD, confirmPassword: SENSITIVE_PASSWORD });
  await submitRegistration(page);
  await expect(errorSummary(page)).toBeHidden();
  const valid = await successFeedback(page);
  await expect(valid).toBeVisible();
});

test('username boundaries and case-insensitive duplicates', async ({ page }) => {
  await gotoRegistration(page);
  const c = controls(page);

  const cases: Array<{ value: string; ok: boolean }> = [
    { value: 'Ab', ok: false },
    { value: 'A1_', ok: false },
    { value: 'Ab3', ok: true },
    { value: 'A'.repeat(18) + '12', ok: true },
    { value: 'A'.repeat(18) + '123', ok: false },
  ];

  for (const row of cases) {
    await resetRegistration(page);
    const id = uniqueRegistration();
    await fillRegistration(page, {
      username: row.value,
      email: id.email,
      password: SENSITIVE_PASSWORD,
      confirmPassword: SENSITIVE_PASSWORD,
    });
    await submitRegistration(page);
    if (row.ok) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, c.username);
    }
  }

  await resetRegistration(page);
  const seed = uniqueRegistration();
  await fillRegistration(page, {
    username: seed.username,
    email: seed.email,
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await page.reload();
  await openRegistration(page);
  await fillRegistration(page, {
    username: seed.username.toUpperCase(),
    email: uniqueRegistration().email,
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, c.username);
});

test('email boundaries and normalized duplicates', async ({ page }) => {
  await gotoRegistration(page);
  const c = controls(page);

  const cases: Array<{ value: string; ok: boolean }> = [
    { value: 'plain', ok: false },
    { value: '.a@b.co', ok: false },
    { value: 'a.@b.co', ok: false },
    { value: 'a..b@b.co', ok: false },
    { value: 'a@b..co', ok: false },
    { value: 'a b@b.co', ok: false },
    { value: 'a@-b.co', ok: false },
    { value: 'a@b.-co', ok: false },
    { value: 'a@b.c', ok: true },
  ];

  for (const row of cases) {
    await resetRegistration(page);
    const id = uniqueRegistration();
    await fillRegistration(page, {
      username: id.username,
      email: row.value,
      password: SENSITIVE_PASSWORD,
      confirmPassword: SENSITIVE_PASSWORD,
    });
    await submitRegistration(page);
    if (row.ok) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, c.email);
    }
  }

  await resetRegistration(page);
  const seed = uniqueRegistration();
  await fillRegistration(page, {
    username: seed.username,
    email: seed.email,
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  await page.reload();
  await openRegistration(page);
  await fillRegistration(page, {
    username: uniqueRegistration().username,
    email: '  ' + seed.email.toUpperCase() + '  ',
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, c.email);
});

test('password, confirmation, and terms boundaries', async ({ page }) => {
  await gotoRegistration(page);
  const c = controls(page);

  const pwCases: Array<{ value: string; ok: boolean }> = [
    { value: 'Password1', ok: false },
    { value: 'Abcdefgh1', ok: false },
    { value: 'Password01', ok: true },
    { value: 'Abcdefghi1', ok: true },
    { value: 'A1' + 'x'.repeat(62), ok: true },
    { value: 'A1' + 'x'.repeat(63), ok: false },
  ];

  for (const row of pwCases) {
    await resetRegistration(page);
    const local = uniqueRegistration();
    await fillRegistration(page, {
      username: local.username,
      email: local.email,
      password: row.value,
      confirmPassword: row.value,
    });
    await submitRegistration(page);
    if (row.ok) {
      await expect(successFeedback(page)).toBeVisible();
    } else {
      await expectRejection(page);
      await expectFieldError(page, c.password);
    }
  }

  await resetRegistration(page);
  const mismatch = uniqueRegistration();
  await fillRegistration(page, {
    username: mismatch.username,
    email: mismatch.email,
    password: SENSITIVE_PASSWORD,
    confirmPassword: 'Different01',
  });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, c.confirmPassword);

  await resetRegistration(page);
  const noTerms = uniqueRegistration();
  await fillRegistration(page, { username: noTerms.username, email: noTerms.email, terms: false });
  await submitRegistration(page);
  await expectRejection(page);
  await expect(c.terms).toHaveAttribute('aria-invalid', 'true');
  await expectFirstInvalid(page, c.terms);

  const dob = uniqueRegistration();
  await resetRegistration(page);
  await fillRegistration(page, {
    username: dob.username,
    email: dob.email,
    dateOfBirth: '2000-02-29',
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
});

test('persistence: trimmed lowercase storage, reload-safe duplicates, no reservation, no password leakage', async ({ page }) => {
  await gotoRegistration(page);
  await resetRegistration(page);
  const id = uniqueRegistration();
  const padded = '  ' + id.username + '  ';
  const mixedEmail = 'User@Example.COM';
  await fillRegistration(page, {
    username: padded,
    email: mixedEmail,
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();

  let corpus = await storageCorpus(page);
  const serialized = JSON.stringify(Object.values(corpus));
  expect(serialized).toContain(id.username);
  expect(serialized).not.toContain(mixedEmail);
  expect(serialized).not.toContain(SENSITIVE_PASSWORD);
  expect(serialized).not.toMatch(/password/i);

  await page.reload();
  await openRegistration(page);
  await fillRegistration(page, {
    username: id.username,
    email: uniqueRegistration().email,
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expectRejection(page);
  const c = controls(page);
  await expectFieldError(page, c.username);

  await page.reload();
  await openRegistration(page);
  await fillRegistration(page, {
    username: uniqueRegistration().username,
    email: 'user@example.com',
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expectRejection(page);
  await expectFieldError(page, c.email);

  await page.reload();
  await openRegistration(page);
  const probe = uniqueRegistration();
  await fillRegistration(page, {
    username: probe.username,
    email: probe.email,
    password: 'short',
    confirmPassword: 'short',
  });
  await submitRegistration(page);
  await expectRejection(page);
  corpus = await storageCorpus(page);
  expect(JSON.stringify(Object.values(corpus))).not.toContain(probe.username);
  expect(JSON.stringify(Object.values(corpus))).not.toContain(probe.email);

  await fillRegistration(page, {
    username: probe.username,
    email: probe.email,
    password: SENSITIVE_PASSWORD,
    confirmPassword: SENSITIVE_PASSWORD,
  });
  await submitRegistration(page);
  await expect(successFeedback(page)).toBeVisible();
  corpus = await storageCorpus(page);
  const final = JSON.stringify(Object.values(corpus));
  expect(final).toContain(probe.username);
  expect(final).not.toContain(SENSITIVE_PASSWORD);
});

test('presentation: dark header, pale page, white panel, orange submit, responsive layout', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoRegistration(page);
  const c = controls(page);

  const header = page.locator('header, [role="banner"]').first();
  await expect(header).toBeVisible();
  const headerBox = await header.boundingBox();
  expect(headerBox?.width ?? 0).toBeGreaterThan(1000);
  const headerBg = rgbChannels(await header.evaluate(el => getComputedStyle(el).backgroundColor));
  expect(headerBg).not.toBeNull();
  expect(headerBg!.b).toBeGreaterThan(headerBg!.r);
  expect(headerBg!.b).toBeGreaterThan(headerBg!.g);
  expect(headerBg!.r).toBeLessThan(80);

  const bodyBg = rgbChannels(await page.evaluate(() => getComputedStyle(document.body).backgroundColor));
  expect(bodyBg).not.toBeNull();
  expect(bodyBg!.r).toBeGreaterThan(200);
  expect(bodyBg!.g).toBeGreaterThan(210);
  expect(bodyBg!.b).toBeGreaterThan(215);
  expect(bodyBg!.b).toBeGreaterThan(bodyBg!.r);

  let panelEl: import('@playwright/test').Locator = c.form;
  for (let i = 0; i < 6; i++) {
    const bg = await panelEl.evaluate(el => getComputedStyle(el).backgroundColor);
    const ch = rgbChannels(bg);
    if (ch && ch.r > 245 && ch.g > 245 && ch.b > 245) break;
    const parentHandle = await panelEl.evaluateHandle(el => el.parentElement);
    const parent = parentHandle.asElement();
    if (!parent) break;
    panelEl = parent as unknown as typeof c.form;
  }
  const panelBg = rgbChannels(await panelEl.evaluate(el => getComputedStyle(el).backgroundColor));
  expect(panelBg).not.toBeNull();
  expect(panelBg!.r).toBeGreaterThan(245);
  expect(panelBg!.g).toBeGreaterThan(245);
  expect(panelBg!.b).toBeGreaterThan(245);

  const submitBg = rgbChannels(await c.submit.evaluate(el => getComputedStyle(el).backgroundColor));
  expect(submitBg).not.toBeNull();
  expect(submitBg!.r).toBeGreaterThan(submitBg!.b);
  expect(submitBg!.r).toBeGreaterThan(180);

  const usernameBox = await c.username.boundingBox();
  const passwordBox = await c.password.boundingBox();
  const confirmBox = await c.confirmPassword.boundingBox();
  if (usernameBox && passwordBox && confirmBox) {
    const related = Math.abs(passwordBox.y - confirmBox.y) < 10 && Math.abs(passwordBox.x - confirmBox.x) > 20;
    expect(related).toBeTruthy();
  }

  await page.setViewportSize({ width: 360, height: 720 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBeFalsy();
  const narrowUsername = await c.username.boundingBox();
  const narrowPassword = await c.password.boundingBox();
  const narrowConfirm = await c.confirmPassword.boundingBox();
  if (narrowUsername && narrowPassword && narrowConfirm) {
    expect(Math.abs(narrowUsername.x - narrowPassword.x)).toBeLessThan(20);
    expect(Math.abs(narrowPassword.x - narrowConfirm.x)).toBeLessThan(20);
    expect(narrowConfirm.y - narrowPassword.y).toBeGreaterThan(20);
  }

  await c.username.focus();
  const focusOutline = await c.username.evaluate(el => {
    const cs = getComputedStyle(el);
    return { outline: cs.outline, shadow: cs.boxShadow };
  });
  const visibleFocus = (focusOutline.outline && !/none/.test(focusOutline.outline)) || (focusOutline.shadow && focusOutline.shadow !== 'none');
  expect(visibleFocus).toBeTruthy();
});
