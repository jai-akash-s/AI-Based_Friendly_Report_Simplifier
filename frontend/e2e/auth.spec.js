import { test, expect } from '@playwright/test';

test('unauthenticated users see the login page', async ({ page }) => {
  await page.goto('/login');
  await expect(page).toHaveTitle(/AI-Based Friendly Report Simplifier/i);
});
