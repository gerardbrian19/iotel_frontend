import { test, expect } from '@playwright/test';

test.describe('Admin Portal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('input[formControlName="email"]', 'admin@demo.com');
    await page.fill('input[formControlName="password"]', 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/admin/);
  });

  test('dashboard loads with KPI cards', async ({ page }) => {
    await page.goto('/admin/dashboard');
    await expect(page.locator('nz-statistic').first()).toBeVisible();
  });

  test('can navigate to orders page', async ({ page }) => {
    await page.getByRole('menuitem', { name: /orders/i }).click();
    await expect(page).toHaveURL(/admin\/orders/);
    await expect(page.locator('nz-table')).toBeVisible();
  });

  test('can navigate to products page', async ({ page }) => {
    await page.getByRole('menuitem', { name: /products/i }).click();
    await expect(page).toHaveURL(/admin\/products/);
    await expect(page.locator('nz-table')).toBeVisible();
  });

  test('can navigate to inventory page', async ({ page }) => {
    await page.getByRole('menuitem', { name: /inventory/i }).click();
    await expect(page).toHaveURL(/admin\/inventory/);
    await expect(page.locator('nz-statistic').first()).toBeVisible();
  });

  test('can navigate to messages page', async ({ page }) => {
    await page.getByRole('menuitem', { name: /messages/i }).click();
    await expect(page).toHaveURL(/admin\/messages/);
  });

  test('can open add product modal', async ({ page }) => {
    await page.goto('/admin/products');
    await page.getByRole('button', { name: /add product/i }).click();
    await expect(page.locator('.ant-modal-content')).toBeVisible();
  });
});
