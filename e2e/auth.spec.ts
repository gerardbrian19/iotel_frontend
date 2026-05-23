import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
  });

  test('shows login form', async ({ page }) => {
    await expect(page.locator('input[type="email"], input[formControlName="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"], input[formControlName="password"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });

  test('shows error for wrong password', async ({ page }) => {
    await page.fill('input[formControlName="email"]', 'customer@demo.com');
    await page.fill('input[formControlName="password"]', 'wrong');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('nz-alert, .ant-alert')).toBeVisible();
  });

  test('customer can login and reach catalog', async ({ page }) => {
    await page.fill('input[formControlName="email"]', 'customer@demo.com');
    await page.fill('input[formControlName="password"]', 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/customer/);
  });

  test('admin can login and reach dashboard', async ({ page }) => {
    await page.fill('input[formControlName="email"]', 'admin@demo.com');
    await page.fill('input[formControlName="password"]', 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/admin/);
  });

  test('staff can login and reach staff dashboard', async ({ page }) => {
    await page.fill('input[formControlName="email"]', 'staff@demo.com');
    await page.fill('input[formControlName="password"]', 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/staff/);
  });

  test('redirects to login when accessing protected route unauthenticated', async ({ page }) => {
    await page.goto('/customer/catalog');
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
