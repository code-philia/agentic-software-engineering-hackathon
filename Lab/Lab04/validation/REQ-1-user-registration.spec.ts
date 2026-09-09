import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  expectSignedIn,
  expectSignedOut,
  expectVisibleFeedback,
  fillRegistrationFields,
  openRegister,
  registerAccount,
  signOut,
  uniqueTicketBookingAccount,
} from './support/e2e';
import type { TicketBookingAccount } from './support/e2e';

type RegistrationOverrides = {
  confirmPassword?: string;
  email?: string;
  omitDocumentNumber?: boolean;
  omitTerms?: boolean;
  password?: string;
  username?: string;
};

async function fillRegistrationForm(page: Page, account: TicketBookingAccount, overrides: RegistrationOverrides = {}) {
  await openRegister(page);
  const effectiveAccount = {
    ...account,
    username: overrides.username ?? account.username,
    password: overrides.password ?? account.password,
    email: overrides.email ?? account.email,
  };
  await fillRegistrationFields(page, effectiveAccount);
  if (overrides.omitDocumentNumber) {
    await page.getByLabel(/证件号码|document number/i).fill('');
  }
  if (overrides.confirmPassword) {
    await page.getByLabel(/确认密码|confirm password/i).fill(overrides.confirmPassword);
  }
  if (overrides.omitTerms) {
    await page.getByRole('checkbox', { name: /服务条款|隐私政策|terms of service|privacy policy/i }).uncheck();
  }
}

async function submitRegistration(page: Page) {
  await page.getByRole('button', { name: /下一步|next step/i }).click();
}

test('REQ-1: successfully register a new account and remain signed in', async ({ page }) => {
  const account = uniqueTicketBookingAccount();

  await openRegister(page);
  await expect(page.getByRole('heading', { name: '账户信息' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: /证件类型/i })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: /优惠.*类型/i })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: /国家\/地区代码/i })).toHaveValue('+86');
  await expect(page.getByRole('combobox', { name: /证件类型/i })).toContainText('护照');
  await expect(page.getByRole('combobox', { name: /优惠.*类型/i })).toContainText('成人');
  await expect(page.getByLabel(/手机号/i)).toBeVisible();

  const password = page.getByLabel(/登录密码/i);
  const passwordStrength = page.getByRole('meter', { name: /密码强度|password strength/i });
  await password.fill('short');
  await expect(passwordStrength).toHaveAttribute('aria-valuenow', '1');
  await password.fill(account.password);
  await expect(passwordStrength).toHaveAttribute('aria-valuenow', '3');

  await registerAccount(page, account);
  await expectSignedIn(page, account.username);
  await page.reload();
  await expectSignedIn(page, account.username);
});

test('REQ-1: reject a duplicate username without creating a signed-in session', async ({ page }) => {
  const account = uniqueTicketBookingAccount();
  await registerAccount(page, account);
  await expectSignedIn(page, account.username);
  await signOut(page);

  await fillRegistrationForm(page, { ...account, name: `Duplicate ${account.name}`, email: `duplicate-${account.email}` });
  await submitRegistration(page);
  await expectVisibleFeedback(page, /用户名已存在|username.+(?:already exists|duplicate|taken|conflict)/i);
  await expectSignedOut(page);
});

test('REQ-1: reject duplicate email with a different username', async ({ page }) => {
  const account = uniqueTicketBookingAccount();
  await registerAccount(page, account);
  await expectSignedIn(page, account.username);
  await signOut(page);

  await fillRegistrationForm(page, { ...account, username: `${account.username}-alt`, email: account.email.toUpperCase() });
  await submitRegistration(page);
  await expectVisibleFeedback(page, /邮箱已存在|email.+(?:already exists|duplicate|taken|conflict)/i);
  await expectSignedOut(page);
});

test('REQ-1: reject mismatched passwords without creating a signed-in session', async ({ page }) => {
  const account = uniqueTicketBookingAccount();
  await fillRegistrationForm(page, account, { confirmPassword: `${account.password}-mismatch` });
  await submitRegistration(page);
  await expectVisibleFeedback(page, /确认密码必须|confirm password.+match/i);
  await expectSignedOut(page);
});

test('REQ-1: reject missing required registration values before creating a session', async ({ page }) => {
  const cases: Array<{ expected: RegExp; overrides: RegistrationOverrides }> = [
    { expected: /请.*同意|服务条款|隐私政策|terms|privacy/i, overrides: { omitTerms: true } },
    { expected: /证件号码.*(?:必填|不能为空|required)|document number.+required/i, overrides: { omitDocumentNumber: true } },
  ];

  for (const currentCase of cases) {
    const account = uniqueTicketBookingAccount();
    await fillRegistrationForm(page, account, currentCase.overrides);
    await submitRegistration(page);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expectSignedOut(page);
  }
});

test('REQ-1: reject malformed username, email, or password without signing in', async ({ page }) => {
  const cases: Array<{ expected: RegExp; overrides: RegistrationOverrides }> = [
    { expected: /用户名格式不正确|username.+(?:invalid|letters|digits|characters)/i, overrides: { username: 'bad username!' } },
    { expected: /邮箱格式不正确|email.+invalid|enter.+valid email/i, overrides: { email: 'not-an-email' } },
    { expected: /登录密码需|password.+(?:invalid|at least|uppercase|lowercase|digit|special|weak)/i, overrides: { password: 'short' } },
  ];

  for (const currentCase of cases) {
    const account = uniqueTicketBookingAccount();
    await fillRegistrationForm(page, account, currentCase.overrides);
    await submitRegistration(page);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toBeEmpty();
    await expectSignedOut(page);
  }
});
