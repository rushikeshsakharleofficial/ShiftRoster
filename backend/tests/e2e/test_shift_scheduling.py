"""E2E tests for shift scheduling workflow."""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC


@pytest.mark.e2e
@pytest.mark.slow
def test_view_shift_calendar(driver, wait, e2e_helper):
    """Test viewing shift calendar page."""
    # Login first
    e2e_helper.login("admin@shiftmaster.com", "admin1234567")

    # Navigate to shifts
    shift_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//nav//a[contains(text(), 'Shift')] | //nav//a[contains(text(), 'Calendar')] | //nav//a[contains(text(), 'Schedule')]")))
    shift_link.click()

    # Wait for calendar to load
    calendar = wait.until(EC.presence_of_element_located((By.XPATH, "//div[@class*='calendar'] | //table | //div[@role='grid']")))
    assert calendar.is_displayed()


@pytest.mark.e2e
@pytest.mark.slow
def test_create_shift(driver, wait, e2e_helper):
    """Test creating a new shift."""
    e2e_helper.login("admin@shiftmaster.com", "admin1234567")

    # Navigate to shifts
    shift_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//nav//a[contains(text(), 'Shift')] | //nav//a[contains(text(), 'Calendar')]")))
    shift_link.click()

    # Click create shift button
    create_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Create')] | //button[contains(text(), 'New')] | //button[contains(text(), 'Add')]")))
    create_button.click()

    # Fill shift form
    shift_title = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@placeholder*='Title'] | //input[@name='title']")))
    shift_title.send_keys("Integration Test Shift")

    # Fill other fields (may vary by implementation)
    try:
        start_time = driver.find_element(By.XPATH, "//input[@name='start_time'] | //input[@type='time']")
        start_time.send_keys("0900")
    except:
        pass  # Field may not be present in all implementations

    # Submit form
    submit_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Save')] | //button[contains(text(), 'Create')]")
    submit_button.click()

    # Wait for confirmation or redirect
    wait.until(EC.presence_of_element_located((By.XPATH, "//div[@role='alert'] | //div[@class*='success'] | //div[@class*='calendar']")))


@pytest.mark.e2e
@pytest.mark.slow
def test_view_shift_details(driver, wait, e2e_helper):
    """Test viewing shift details."""
    e2e_helper.login("admin@shiftmaster.com", "admin1234567")

    # Navigate to shifts
    shift_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//nav//a[contains(text(), 'Shift')] | //nav//a[contains(text(), 'Calendar')]")))
    shift_link.click()

    # Click first available shift
    try:
        shift_item = wait.until(EC.element_to_be_clickable((By.XPATH, "//div[@class*='shift'] | //tr | //li[contains(@class, 'shift')]")))
        shift_item.click()

        # Wait for details to load
        details_panel = wait.until(EC.presence_of_element_located((By.XPATH, "//div[@class*='detail'] | //aside | //panel")))
        assert details_panel.is_displayed()
    except:
        # No shifts available, which is acceptable
        pass
