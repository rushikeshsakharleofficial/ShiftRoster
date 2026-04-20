"""E2E tests for authentication flow."""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC


@pytest.mark.e2e
@pytest.mark.slow
def test_login_success(driver, wait, e2e_helper, base_url):
    """Test successful login flow."""
    e2e_helper.navigate_to("/login")

    # Login with test credentials
    email_field = wait.until(EC.presence_of_element_located((By.NAME, "email")))
    email_field.send_keys("admin@shiftmaster.com")

    password_field = driver.find_element(By.NAME, "password")
    password_field.send_keys("admin1234567")

    login_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Login')] | //button[contains(text(), 'Sign in')]")
    login_button.click()

    # Wait for dashboard
    wait.until(EC.presence_of_element_located((By.XPATH, "//nav | //div[@role='navigation']")))

    # Verify we're logged in
    current_url = driver.current_url
    assert "/login" not in current_url
    assert "dashboard" in current_url or "home" in current_url or "shifts" in current_url


@pytest.mark.e2e
@pytest.mark.slow
def test_login_invalid_credentials(driver, wait, base_url):
    """Test login with invalid credentials."""
    driver.get(f"{base_url}/login")

    email_field = wait.until(EC.presence_of_element_located((By.NAME, "email")))
    email_field.send_keys("invalid@test.com")

    password_field = driver.find_element(By.NAME, "password")
    password_field.send_keys("wrongpassword")

    login_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Login')] | //button[contains(text(), 'Sign in')]")
    login_button.click()

    # Wait for error message
    error_message = wait.until(
        EC.presence_of_element_located((By.XPATH, "//div[@role='alert'] | //span[contains(text(), 'Invalid')] | //p[contains(text(), 'Error')]"))
    )
    assert error_message.is_displayed()


@pytest.mark.e2e
@pytest.mark.slow
def test_logout_flow(driver, wait, e2e_helper):
    """Test logout functionality."""
    # Login first
    e2e_helper.login("admin@shiftmaster.com", "admin1234567")

    # Click profile/menu button
    menu_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[@aria-label='Menu'] | //button[contains(@class, 'profile')] | //img[@alt='Profile']")))
    menu_button.click()

    # Click logout
    logout_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Logout')] | //button[contains(text(), 'Sign out')]")))
    logout_button.click()

    # Should redirect to login
    wait.until(EC.presence_of_element_located((By.NAME, "email")))
    assert "login" in driver.current_url
