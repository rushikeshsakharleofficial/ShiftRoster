"""E2E test fixtures for Selenium tests."""
import pytest
import os
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.chrome.service import Service


@pytest.fixture(scope="session")
def base_url():
    """Base URL for E2E tests."""
    return os.environ.get("BASE_URL", "http://localhost:3000")


@pytest.fixture(scope="function")
def driver(base_url):
    """Create Selenium WebDriver for testing."""
    chrome_options = Options()

    # Headless mode for CI/CD
    if os.environ.get("BROWSER_HEADLESS", "false").lower() == "true":
        chrome_options.add_argument("--headless")

    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.implicitly_wait(10)

    yield driver

    # Cleanup
    driver.quit()


@pytest.fixture
def wait(driver):
    """Create WebDriverWait instance."""
    return WebDriverWait(driver, 10)


class E2EHelpers:
    """Helper methods for E2E tests."""

    def __init__(self, driver, wait, base_url):
        self.driver = driver
        self.wait = wait
        self.base_url = base_url

    def login(self, email, password):
        """Login to the application."""
        self.driver.get(f"{self.base_url}/login")

        email_field = self.wait.until(
            EC.presence_of_element_located((By.NAME, "email"))
        )
        password_field = self.driver.find_element(By.NAME, "password")
        login_button = self.driver.find_element(By.XPATH, "//button[contains(text(), 'Login')]")

        email_field.send_keys(email)
        password_field.send_keys(password)
        login_button.click()

        # Wait for dashboard or next page
        self.wait.until(EC.presence_of_element_located((By.XPATH, "//nav | //div[@role='navigation']")))

    def logout(self):
        """Logout from application."""
        menu_button = self.driver.find_element(By.XPATH, "//button[@aria-label='Menu'] | //button[contains(@class, 'profile')]")
        menu_button.click()
        logout_button = self.wait.until(
            EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Logout')] | //a[contains(text(), 'Logout')]"))
        )
        logout_button.click()

    def navigate_to(self, path):
        """Navigate to a specific path."""
        self.driver.get(f"{self.base_url}{path}")

    def get_current_url(self):
        """Get current page URL."""
        return self.driver.current_url

    def take_screenshot(self, name):
        """Take a screenshot for debugging."""
        self.driver.save_screenshot(f"tests/e2e/screenshots/{name}.png")


@pytest.fixture
def e2e_helper(driver, wait, base_url):
    """Create E2E helper instance."""
    return E2EHelpers(driver, wait, base_url)
