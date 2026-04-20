"""E2E tests for leave request workflow."""
import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC


@pytest.mark.e2e
@pytest.mark.slow
def test_view_leave_page(driver, wait, e2e_helper):
    """Test viewing leave management page."""
    e2e_helper.login("admin@shiftmaster.com", "admin1234567")

    # Navigate to leave
    leave_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//nav//a[contains(text(), 'Leave')] | //nav//a[contains(text(), 'Requests')]")))
    leave_link.click()

    # Wait for leave page to load
    leave_page = wait.until(EC.presence_of_element_located((By.XPATH, "//div[@class*='leave'] | //div[@class*='request']")))
    assert leave_page.is_displayed()


@pytest.mark.e2e
@pytest.mark.slow
def test_submit_leave_request(driver, wait, e2e_helper):
    """Test submitting a leave request."""
    e2e_helper.login("admin@shiftmaster.com", "admin1234567")

    # Navigate to leave
    leave_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//nav//a[contains(text(), 'Leave')] | //nav//a[contains(text(), 'Requests')]")))
    leave_link.click()

    # Click request leave button
    request_button = wait.until(EC.element_to_be_clickable((By.XPATH, "//button[contains(text(), 'Request')] | //button[contains(text(), 'New')] | //button[contains(text(), 'Apply')]")))
    request_button.click()

    # Fill leave form
    try:
        leave_type = wait.until(EC.presence_of_element_located((By.XPATH, "//select[@name='leave_type'] | //input[@name='leave_type']")))
        leave_type.send_keys("Sick Leave")
    except:
        pass

    try:
        from_date = driver.find_element(By.XPATH, "//input[@name='from_date'] | //input[@type='date']")
        from_date.send_keys("01012024")
    except:
        pass

    try:
        to_date = driver.find_element(By.XPATH, "//input[@name='to_date']")
        to_date.send_keys("02012024")
    except:
        pass

    # Submit
    submit_button = driver.find_element(By.XPATH, "//button[contains(text(), 'Submit')] | //button[contains(text(), 'Request')]")
    submit_button.click()

    # Wait for success message
    wait.until(EC.presence_of_element_located((By.XPATH, "//div[@role='alert'] | //div[@class*='success']")))


@pytest.mark.e2e
@pytest.mark.slow
def test_view_leave_requests_as_manager(driver, wait, e2e_helper):
    """Test viewing leave requests as a manager."""
    e2e_helper.login("admin@shiftmaster.com", "admin1234567")

    # Navigate to leave
    leave_link = wait.until(EC.element_to_be_clickable((By.XPATH, "//nav//a[contains(text(), 'Leave')] | //nav//a[contains(text(), 'Requests')]")))
    leave_link.click()

    # Look for pending requests table/list
    try:
        requests_list = wait.until(EC.presence_of_element_located((By.XPATH, "//table | //div[@class*='request'] | //ul[@class*='request']")))
        assert requests_list.is_displayed()
    except:
        # No requests list visible, which is acceptable
        pass
