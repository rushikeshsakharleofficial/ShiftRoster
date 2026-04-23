const { test, expect } = require('@playwright/test');

test.describe('ShiftRoster E2E Tests', () => {
  test('Complete User Workflow', async ({ page }) => {
    // 1. Login
    console.log('Navigating to http://localhost:8080/login');
    await page.goto('http://localhost:8080/login');
    
    await page.getByTestId('login-email-input').fill('admin@shiftmaster.com');
    await page.getByTestId('login-password-input').fill('admin123');
    await page.getByTestId('login-submit-btn').click();

    // 2. Dashboard
    console.log('Waiting for Dashboard...');
    await expect(page).toHaveURL(/http:\/\/localhost:8080\/?/, { timeout: 15000 });
    const sidebar = page.getByTestId('app-sidebar');
    await expect(sidebar).toBeVisible();
    await page.screenshot({ path: 'tests/e2e/screenshots/1_dashboard.png', fullPage: true });

    // 3. Shift Calendar
    console.log('Navigating to Shift Calendar...');
    await page.getByTestId('nav-shift-calendar').click();
    await expect(page).toHaveURL(/.*shifts/);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/e2e/screenshots/2_shifts.png', fullPage: true });

    // 4. Sticky Notes
    console.log('Navigating to Sticky Notes...');
    await page.getByTestId('nav-sticky-notes').click();
    await expect(page).toHaveURL(/.*sticky-notes/);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/e2e/screenshots/3_sticky_notes.png', fullPage: true });

    // 5. Employees
    console.log('Navigating to Employees...');
    await page.getByTestId('nav-employees').click();
    await expect(page).toHaveURL(/.*employees/);
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/e2e/screenshots/4_employees.png', fullPage: true });

    // 6. Logout
    console.log('Logging out...');
    await page.getByTestId('logout-btn').click();
    await expect(page).toHaveURL(/.*login/);
    console.log('Workflow complete.');
  });
});
