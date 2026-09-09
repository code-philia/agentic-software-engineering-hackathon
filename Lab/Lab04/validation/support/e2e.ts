import { expect, Page } from '@playwright/test';

export type TicketBookingAccount = {
  username: string;
  email: string;
  password: string;
  name: string;
  documentType: string;
  documentNumber: string;
  discountType: string;
  countryCode: string;
  mobileNumber: string;
};

export type SearchCriteria = {
  from: string;
  to: string;
  date: string;
};

export function baseUrl(): string {
  return process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3301';
}

export function uniqueTicketBookingAccount(): TicketBookingAccount {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const username = `tb-user-${suffix}`;

  return {
    username,
    email: `${username}@example.test`,
    password: 'Valid-password-123!',
    name: `Ticket User ${suffix}`,
    documentType: 'passport',
    documentNumber: `P${suffix.replace(/[^0-9]/g, '').slice(0, 11) || Date.now()}`,
    discountType: 'adult',
    countryCode: '+84',
    mobileNumber: '912345678',
  };
}

export async function openHome(page: Page): Promise<void> {
  await page.goto(baseUrl());
}

export async function openRegister(page: Page): Promise<void> {
  await openHome(page);
  await page.locator('a[href="/register"]').click();
}

export async function openLogin(page: Page): Promise<void> {
  await openHome(page);
  await page.locator('a[href="/login"]').click();
}

export async function expectSignedIn(page: Page, username: string): Promise<void> {
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /退出登录|sign out/i })).toBeVisible();
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('link', { name: /退出登录|sign out/i }).click();
  await expect(page.getByRole('link', { name: /登录|login/i })).toBeVisible();
}

export async function fillLabeledValue(page: Page, label: RegExp | string, value: string): Promise<void> {
  const control = page.getByLabel(label);
  await expect(control).toBeVisible();
  const tagName = await control.evaluate((element) => element.tagName.toLowerCase());
  if (tagName === 'select') {
    const option = await control.locator('option').evaluateAll((options, requestedValue) => {
      const aliases: Record<string, string[]> = {
        passport: ['passport', '护照'],
        adult: ['adult', '成人'],
      };
      const candidates = aliases[String(requestedValue).toLowerCase()] ?? [String(requestedValue)];
      return options
        .map((element) => ({
          label: element.textContent?.trim() ?? '',
          value: (element as HTMLOptionElement).value,
        }))
        .find((item) => candidates.some((candidate) =>
          item.value.toLowerCase() === candidate.toLowerCase() ||
          item.label.toLowerCase() === candidate.toLowerCase() ||
          item.label.toLowerCase().includes(candidate.toLowerCase()),
        ));
    }, value);
    if (!option) {
      throw new Error(`No select option matching "${value}" was found`);
    }
    await control.selectOption({ value: option.value });
    return;
  }
  await control.fill(value);
}

export async function expectSignedOut(page: Page): Promise<void> {
  await expect(page.locator(
    'a[aria-label="Sign out"], a[aria-label="\u9000\u51fa\u767b\u5f55"], a[href="/logout"]',
  )).toHaveCount(0);
}

export async function expectVisibleAlert(page: Page): Promise<void> {
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible();
  await expect(alert).not.toBeEmpty();
}

export async function registerAccount(page: Page, account: TicketBookingAccount): Promise<void> {
  await openRegister(page);
  await fillRegistrationFields(page, account);
  await page.getByRole('button', { name: /下一步|next step/i }).click();
}

export async function fillRegistrationFields(page: Page, account: TicketBookingAccount): Promise<void> {
  await fillLabeledValue(page, /用户名|username/i, account.username);
  await fillLabeledValue(page, /登录密码|^password$/i, account.password);
  await fillLabeledValue(page, /确认密码|confirm password/i, account.password);
  await fillLabeledValue(page, /证件类型|document type/i, account.documentType);
  await fillLabeledValue(page, /姓名|^name$/i, account.name);
  await fillLabeledValue(page, /证件号码|document number|passport number/i, account.documentNumber);
  await fillLabeledValue(page, /优惠.*类型|passenger type|discount type/i, account.discountType);
  await fillLabeledValue(page, /邮箱|email address/i, account.email);
  await fillLabeledValue(page, /国家\/地区代码|country\/region code/i, account.countryCode);
  await fillLabeledValue(page, /手机号|mobile number/i, account.mobileNumber);
  await page.getByRole('checkbox', { name: /服务条款|隐私政策|terms of service|privacy policy/i }).check();
}

export async function signIn(page: Page, usernameOrEmail: string, password: string): Promise<void> {
  await openLogin(page);
  await fillLabeledValue(page, /用户名或邮箱|username or email|email\/username\/mobile number/i, usernameOrEmail);
  await fillLabeledValue(page, /^密码$|^password$/i, password);
  await page.getByRole('button', { name: /立即登录|登录|login|sign in/i }).click();
}

export async function searchTrains(page: Page, criteria: SearchCriteria): Promise<void> {
  await openHome(page);
  await page.getByLabel(/^from$/i).fill(criteria.from);
  await page.getByLabel(/^to$/i).fill(criteria.to);
  await page.getByLabel(/^date$/i).fill(criteria.date);
  await page.getByRole('button', { name: /search/i }).click();
}

export async function openBookableTrain(page: Page, trainNumber: string): Promise<void> {
  const bookAction = page.getByRole('button', {
    name: new RegExp(`book\\s+${trainNumber}|${trainNumber}\\s+book`, 'i'),
  });
  await expect(bookAction).toBeVisible();
  await bookAction.click();
}

export async function expectVisibleFeedback(page: Page, expected: RegExp): Promise<void> {
  await expect.poll(async () => {
    if ((await visibleFeedbackTexts(page, expected)).length > 0) return true;
    const alert = page.getByRole('alert');
    return (await alert.count()) > 0
      && (await alert.first().isVisible())
      && (await alert.first().innerText()).trim().length > 0;
  }).toBe(true);
}

export async function readVisibleFeedback(page: Page, expected: RegExp): Promise<string> {
  const messages = await visibleFeedbackTexts(page, expected);
  expect(messages, 'Exactly one matching feedback message must be visible').toHaveLength(1);
  return messages[0];
}

async function visibleFeedbackTexts(page: Page, expected: RegExp): Promise<string[]> {
  const candidates = page.getByText(expected);
  const messages: string[] = [];
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) {
      messages.push((await candidate.innerText()).trim());
    }
  }
  return messages;
}

export async function expectVisibleJourneyTimes(page: Page): Promise<void> {
  const timePattern = /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/;
  await expect
    .poll(async () => {
      const timeValues = page.getByText(timePattern);
      const visibleText: string[] = [];
      for (let index = 0; index < (await timeValues.count()); index += 1) {
        const value = timeValues.nth(index);
        if (await value.isVisible()) {
          visibleText.push(await value.innerText());
        }
      }
      const allTimes = new RegExp(timePattern.source, 'g');
      return visibleText.flatMap((value) => value.match(allTimes) ?? []).length;
    })
    .toBeGreaterThanOrEqual(2);
}

export async function expectSearchSummary(
  page: Page,
  criteria: SearchCriteria,
): Promise<void> {
  await expect(page.getByText(criteria.from, { exact: false })).toBeVisible();
  await expect(page.getByText(criteria.to, { exact: false })).toBeVisible();
  await expect(page.getByText(criteria.date, { exact: false })).toBeVisible();
}

export async function expectBookingSummary(page: Page): Promise<void> {
  await expect(page.getByText(/train information/i)).toBeVisible();
  await expect(page.getByText(/passenger information/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /place order/i })).toBeVisible();
}
