import { test, expect } from '@playwright/test';
import {
  controls, openRegistration, resetRegistration, uniqueRegistration,
  fillRegistration, submitRegistration, successFeedback, errorSummary,
  expectFieldError, expectFirstInvalid, expectRejection, storageCorpus,
} from './course-gui-test-support.js';

const VALID_PASSWORD = 'Password01';
const VALID_PASSWORD_64 = 'A1' + 'x'.repeat(62);

function isDarkNavy(r: number, g: number, b: number): boolean {
  return b > r && b > g && b > 60 && b < 180 && r < 120;
}
function isPaleBlueGray(r: number, g: number, b: number): boolean {
  return b >= r && b >= g && r > 200 && g > 200 && b > 200 && b < 250;
}
function isWhite(r: number, g: number, b: number): boolean {
  return r > 245 && g > 245 && b > 245;
}
function isOrangeAccent(r: number, g: number, b: number): boolean {
  return r > 180 && g > 80 && g < 180 && b < 100;
}
async function bgColor(page: any, selector: string): Promise<[number, number, number]> {
  const rgb = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement;
    if (!el) return null;
    let node: HTMLElement | null = el;
    while (node) {
      const s = getComputedStyle(node);
      if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') {
        return s.backgroundColor;
      }
      node = node.parentElement;
    }
    return getComputedStyle(el).backgroundColor;
  }, selector);
  const m = rgb?.match(/\d+/g);
  if (!m) return [0, 0, 0];
  return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])];
}

test.describe('Registration', () => {
  test('accessible structure and semantic form', async ({ page }) => {
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
    const submitText = (await c.submit.textContent()) ?? '';
    expect(submitText.toLowerCase()).toMatch(/register|sign\s*up|create/);
    for (const f of [c.username, c.email, c.password, c.confirmPassword]) {
      const label = await f.getAttribute('aria-label');
      const id = await f.getAttribute('id');
      let hasLabel = false;
      if (label && label.trim()) hasLabel = true;
      if (!hasLabel && id) {
        const lbl = page.locator(`label[for="${id}"]`);
        hasLabel = await lbl.count() > 0;
      }
      expect(hasLabel).toBeTruthy();
    }
  });

  test('empty submission reports all required problems with summary and focus', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await fillRegistration(page, {
      username: '', email: '', password: '', confirmPassword: '', terms: false,
    });
    await submitRegistration(page);
    await expectRejection(page);
    const summary = await errorSummary(page);
    await expect(summary).toBeVisible();
    await expectFieldError(page, c.username);
    await expectFieldError(page, c.email);
    await expectFieldError(page, c.password);
    await expectFieldError(page, c.terms);
    await expectFirstInvalid(page);
  });

  test('corrected valid submission clears stale errors and summary', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await fillRegistration(page, { username: '', email: '', password: '', confirmPassword: '' });
    await submitRegistration(page);
    await expectRejection(page);
    const summary1 = await errorSummary(page);
    await expect(summary1).toBeVisible();
    const u = uniqueRegistration();
    await fillRegistration(page, {
      username: u.username, email: u.email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
    await expect(summary1).not.toBeVisible();
  });

  test('username boundaries', async ({ page }) => {
    await resetRegistration(page);
    const cases: Array<{ val: string; valid: boolean; field: string }> = [
      { val: '  Ab3  ', valid: true, field: 'username' },
      { val: '  Ab  ', valid: false, field: 'username' },
      { val: 'A1b', valid: true, field: 'username' },
      { val: 'a'.repeat(20), valid: true, field: 'username' },
      { val: 'a'.repeat(21), valid: false, field: 'username' },
      { val: '1abc', valid: false, field: 'username' },
      { val: 'ab-cd', valid: false, field: 'username' },
      { val: '   ', valid: false, field: 'username' },
    ];
    for (const row of cases) {
      await resetRegistration(page);
      const u = uniqueRegistration();
      await fillRegistration(page, {
        username: row.val, email: u.email, password: VALID_PASSWORD,
      });
      await submitRegistration(page);
      if (row.valid) {
        await expect(await successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, controls(page).username);
      }
    }
  });

  test('email boundaries', async ({ page }) => {
    await resetRegistration(page);
    const cases: Array<{ val: string; valid: boolean }> = [
      { val: '  User@Example.COM  ', valid: true },
      { val: 'a@b.c', valid: true },
      { val: 'user@', valid: false },
      { val: '@example.com', valid: false },
      { val: 'user@example', valid: false },
      { val: 'user@.com', valid: false },
      { val: 'user@example..com', valid: false },
      { val: 'user@-example.com', valid: false },
      { val: 'user@example-.com', valid: false },
      { val: '.user@example.com', valid: false },
      { val: 'user.@example.com', valid: false },
      { val: 'us er@example.com', valid: false },
    ];
    for (const row of cases) {
      await resetRegistration(page);
      const u = uniqueRegistration();
      await fillRegistration(page, {
        username: u.username, email: row.val, password: VALID_PASSWORD,
      });
      await submitRegistration(page);
      if (row.valid) {
        await expect(await successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, controls(page).email);
      }
    }
  });

  test('password and confirmation boundaries', async ({ page }) => {
    await resetRegistration(page);
    const cases: Array<{
      pw: string; confirm?: string; valid: boolean; field: 'password' | 'confirmPassword';
    }> = [
      { pw: VALID_PASSWORD, valid: true, field: 'password' },
      { pw: 'Abcdefgh1', valid: false, field: 'password' },
      { pw: 'abcdefghi1', valid: true, field: 'password' },
      { pw: 'ABCDEFGHI1', valid: true, field: 'password' },
      { pw: 'Password', valid: false, field: 'password' },
      { pw: '1234567890', valid: false, field: 'password' },
      { pw: VALID_PASSWORD_64, valid: true, field: 'password' },
      { pw: 'A1' + 'x'.repeat(63), valid: false, field: 'password' },
      { pw: VALID_PASSWORD, confirm: 'Different01', valid: false, field: 'confirmPassword' },
    ];
    for (const row of cases) {
      await resetRegistration(page);
      const u = uniqueRegistration();
      const overrides: Record<string, unknown> = {
        username: u.username, email: u.email, password: row.pw,
      };
      if (row.confirm !== undefined) overrides.confirmPassword = row.confirm;
      await fillRegistration(page, overrides);
      await submitRegistration(page);
      if (row.valid) {
        await expect(await successFeedback(page)).toBeVisible();
      } else {
        await expectRejection(page);
        await expectFieldError(page, controls(page)[row.field]);
      }
    }
  });

  test('terms and optional date of birth', async ({ page }) => {
    await resetRegistration(page);
    const u = uniqueRegistration();
    await fillRegistration(page, {
      username: u.username, email: u.email, password: VALID_PASSWORD, terms: false,
    });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, controls(page).terms);

    await resetRegistration(page);
    const u2 = uniqueRegistration();
    await fillRegistration(page, {
      username: u2.username, email: u2.email, password: VALID_PASSWORD,
      dateOfBirth: '1995-06-15',
    });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();

    await resetRegistration(page);
    const u3 = uniqueRegistration();
    await fillRegistration(page, {
      username: u3.username, email: u3.email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
  });

  test('show/hide password toggle updates both inputs and accessible name', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    await fillRegistration(page, { password: VALID_PASSWORD });
    await expect(c.password).toHaveAttribute('type', 'password');
    await expect(c.confirmPassword).toHaveAttribute('type', 'password');
    const nameBefore = (await c.passwordToggle.getAttribute('aria-label')) ??
      (await c.passwordToggle.textContent()) ?? '';
    await c.passwordToggle.click();
    await expect(c.password).toHaveAttribute('type', 'text');
    await expect(c.confirmPassword).toHaveAttribute('type', 'text');
    const nameAfter = (await c.passwordToggle.getAttribute('aria-label')) ??
      (await c.passwordToggle.textContent()) ?? '';
    expect(nameAfter.trim().toLowerCase()).not.toBe(nameBefore.trim().toLowerCase());
    await c.passwordToggle.click();
    await expect(c.password).toHaveAttribute('type', 'password');
    await expect(c.confirmPassword).toHaveAttribute('type', 'password');
  });

  test('persistence: trimmed username, lowercased email, no passwords in storage', async ({ page }) => {
    await resetRegistration(page);
    const u = uniqueRegistration();
    const paddedUser = '  ' + u.username.toUpperCase().slice(0, 5) + '_X  ';
    const mixedEmail = '  ' + u.email.charAt(0).toUpperCase() + u.email.slice(1) + '  ';
    await fillRegistration(page, {
      username: paddedUser, email: mixedEmail, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
    const corpus = await storageCorpus(page);
    const allText = Object.values(corpus).join('\n') + '\n' + Object.keys(corpus).join('\n');
    expect(allText).toContain(paddedUser.trim());
    expect(allText).toContain(mixedEmail.trim().toLowerCase());
    expect(allText).not.toContain(VALID_PASSWORD);
    for (const key of Object.keys(corpus)) {
      expect(key.toLowerCase()).not.toContain('password');
      expect(corpus[key]).not.toContain(VALID_PASSWORD);
    }
  });

  test('duplicate username and email survive reload', async ({ page }) => {
    await resetRegistration(page);
    const u = uniqueRegistration();
    await fillRegistration(page, {
      username: u.username, email: u.email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();

    await fillRegistration(page, {
      username: u.username, email: uniqueRegistration().email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, controls(page).username);

    await fillRegistration(page, {
      username: uniqueRegistration().username, email: u.email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, controls(page).email);

    await page.reload();
    await fillRegistration(page, {
      username: u.username, email: uniqueRegistration().email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, controls(page).username);

    await fillRegistration(page, {
      username: uniqueRegistration().username, email: u.email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expectRejection(page);
    await expectFieldError(page, controls(page).email);
  });

  test('rejected attempt reserves nothing', async ({ page }) => {
    await resetRegistration(page);
    const u = uniqueRegistration();
    await fillRegistration(page, {
      username: u.username, email: u.email, password: 'Short1', terms: false,
    });
    await submitRegistration(page);
    await expectRejection(page);

    await fillRegistration(page, {
      username: u.username, email: u.email, password: VALID_PASSWORD,
    });
    await submitRegistration(page);
    await expect(await successFeedback(page)).toBeVisible();
  });

  test('presentation: header, background, panel, accent, responsive, focus', async ({ page }) => {
    await resetRegistration(page);
    const c = controls(page);
    const headerColor = await bgColor(page, 'header, [role="banner"], h1');
    expect(isDarkNavy(...headerColor)).toBeTruthy();
    const bodyColor = await bgColor(page, 'body');
    expect(isPaleBlueGray(...bodyColor)).toBeTruthy();
    const panelColor = await page.evaluate(() => {
      const form = document.querySelector('form') as HTMLElement;
      if (!form) return null;
      let node: HTMLElement | null = form;
      while (node && node !== document.body) {
        const s = getComputedStyle(node);
        if (s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') {
          const m = s.backgroundColor.match(/\d+/g);
          if (m) return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])];
        }
        node = node.parentElement;
      }
      return null;
    });
    expect(panelColor && isWhite(...panelColor)).toBeTruthy();
    const submitColor = await bgColor(page, 'button[type="submit"], input[type="submit"]');
    expect(isOrangeAccent(...submitColor)).toBeTruthy();

    await page.setViewportSize({ width: 1280, height: 800 });
    const formBox = await c.form.boundingBox();
    const pageWidth = 1280;
    expect(formBox && formBox.x > 50 && formBox.x + formBox.width < pageWidth - 50).toBeTruthy();

    await page.setViewportSize({ width: 375, height: 700 });
    await expect(c.form).toBeVisible();
    const mobileBox = await c.form.boundingBox();
    expect(mobileBox && mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 376).toBeTruthy();

    await c.username.focus();
    await page.keyboard.press('Tab');
    const activeTag = await page.evaluate(() => document.activeElement?.tagName ?? '');
    expect(activeTag).toBe('INPUT');
    const focusVisible = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement;
      if (!el) return false;
      const s = getComputedStyle(el);
      return s.outlineStyle !== 'none' && s.outlineWidth !== '0px' ||
        s.boxShadow !== 'none' || s.borderStyle !== 'none';
    });
    expect(focusVisible).toBeTruthy();
  });
});
