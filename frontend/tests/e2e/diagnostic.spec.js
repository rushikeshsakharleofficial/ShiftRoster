const { test, expect } = require('@playwright/test');

test('Diagnostic - Login Attempt', async ({ page }) => {
  await page.goto('http://localhost:8080/login');
  
  await page.getByTestId('login-email-input').fill('admin@shiftmaster.com');
  await page.getByTestId('login-password-input').fill('admin123');
  await page.getByTestId('login-submit-btn').click();
  
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'tests/e2e/screenshots/diag_after_login_admin123.png' });
  
  console.log('URL after admin123:', page.url());
  let errorText = await page.locator('[data-testid="login-error"]').textContent().catch(() => 'No error shown');
  console.log('Error text (admin123):', errorText);

  if (page.url().includes('login')) {
      console.log('Trying admin1234567...');
      await page.getByTestId('login-password-input').fill('admin1234567');
      await page.getByTestId('login-submit-btn').click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'tests/e2e/screenshots/diag_after_login_admin1234567.png' });
      console.log('URL after admin1234567:', page.url());
      errorText = await page.locator('[data-testid="login-error"]').textContent().catch(() => 'No error shown');
      console.log('Error text (admin1234567):', errorText);
  }
});
