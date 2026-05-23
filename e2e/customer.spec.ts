import { test, expect } from '@playwright/test';

test.describe('Customer Portal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/auth/login');
    await page.fill('input[formControlName="email"]', 'customer@demo.com');
    await page.fill('input[formControlName="password"]', 'password123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/customer/);
  });

  test('catalog displays products', async ({ page }) => {
    await page.goto('/customer/catalog');
    await expect(page.locator('nz-card').first()).toBeVisible();
  });

  test('can filter catalog by category', async ({ page }) => {
    await page.goto('/customer/catalog');
    await page.getByRole('tab', { name: /handheld/i }).click();
    await expect(page.locator('nz-card').first()).toBeVisible();
  });

  test('can add item to cart', async ({ page }) => {
    await page.goto('/customer/catalog');
    await page.getByRole('button', { name: /add to cart/i }).first().click();
    await expect(page.locator('.cart-badge, nz-badge')).toBeVisible();
  });

  test('cart page shows items after adding', async ({ page }) => {
    await page.goto('/customer/catalog');
    await page.getByRole('button', { name: /add to cart/i }).first().click();
    await page.goto('/customer/cart');
    await expect(page.locator('.cart-item, .ant-table-row').first()).toBeVisible();
  });

  test('checkout page accessible from cart', async ({ page }) => {
    await page.goto('/customer/catalog');
    await page.getByRole('button', { name: /add to cart/i }).first().click();
    await page.goto('/customer/cart');
    await page.getByRole('button', { name: /checkout/i }).click();
    await expect(page).toHaveURL(/checkout/);
  });

  test('orders page loads', async ({ page }) => {
    await page.goto('/customer/orders');
    await expect(page).toHaveURL(/orders/);
  });

  test('services page loads', async ({ page }) => {
    await page.goto('/customer/services');
    await expect(page).toHaveURL(/services/);
  });

  test('messages page loads', async ({ page }) => {
    await page.goto('/customer/messages');
    await expect(page).toHaveURL(/messages/);
  });
});
