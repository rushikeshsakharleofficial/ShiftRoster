
import os
import time
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager

# Constants
BASE_URL = "http://localhost:8080"
ADMIN_USER = "admin@shiftmaster.com"
ADMIN_PASS = "admin123"

def setup_driver():
    options = Options()
    options.add_argument("--headless")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    return driver

def log_console(driver):
    try:
        for entry in driver.get_log('browser'):
            print(f"BROWSER_LOG: {entry['level']} - {entry['message']}")
    except:
        pass

def test_full_flow():
    driver = setup_driver()
    wait = WebDriverWait(driver, 15)
    
    try:
        print(f"--- 1. Testing Login at {BASE_URL}/login ---")
        driver.get(f"{BASE_URL}/login")
        
        email_input = wait.until(EC.presence_of_element_located((By.ID, "email")))
        pass_input = driver.find_element(By.ID, "password")
        login_btn = driver.find_element(By.CSS_SELECTOR, "[data-testid='login-submit-btn']")
        
        email_input.send_keys(ADMIN_USER)
        pass_input.send_keys(ADMIN_PASS)
        login_btn.click()
        print("Login button clicked. Waiting for dashboard...")
        
        # Wait for dashboard (check URL change)
        time.sleep(5)
        print(f"URL after 5s: {driver.current_url}")
        
        if "/login" in driver.current_url:
            print("CRITICAL: Login failed - redirected back or stuck on login page.")
            body = driver.find_element(By.TAG_NAME, "body").text
            print(f"Page Text: {body[:500]}")
            log_console(driver)
            return

        print("--- 2. Checking Sidebar Links ---")
        sidebar = wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "[data-testid='app-sidebar']")))
        print("Sidebar found.")
        
        # Test expanded sidebar
        nav_items = ["nav-dashboard", "nav-shift-calendar", "nav-employees", "nav-settings"]
        for item in nav_items:
            try:
                el = driver.find_element(By.CSS_SELECTOR, f"[data-testid='{item}']")
                print(f"Nav item '{item}' is VISIBLE.")
            except:
                print(f"CRITICAL: Nav item '{item}' is MISSING.")

        print("--- 3. Testing Settings Page ---")
        settings_link = driver.find_element(By.CSS_SELECTOR, "[data-testid='nav-settings']")
        settings_link.click()
        print("Clicked settings. Waiting...")
        
        time.sleep(5)
        print(f"Switched to Settings. Current URL: {driver.current_url}")
        
        # Check if page is blank
        body_text = driver.find_element(By.TAG_NAME, "body").text
        if len(body_text.strip()) < 100:
             print("CRITICAL: Settings page appears BLANK.")
             log_console(driver)
        else:
            print(f"Settings page content length: {len(body_text)}")
            if "Chat Security" in body_text:
                print("SUCCESS: Chat Security section found.")
            else:
                print("MEDIUM: Chat Security section MISSING on Settings page.")

        print("--- 4. Testing Chat Page ---")
        chat_link = driver.find_element(By.CSS_SELECTOR, "[data-testid='nav-chat']")
        chat_link.click()
        print("Clicked chat. Waiting...")
        
        time.sleep(5)
        print(f"Switched to Chat. Current URL: {driver.current_url}")
        
        body_text = driver.find_element(By.TAG_NAME, "body").text
        if len(body_text.strip()) < 100:
             print("CRITICAL: Chat page appears BLANK.")
             log_console(driver)
        else:
            print("Chat page has content.")

    except Exception as e:
        print(f"ERROR during test: {str(e)}")
        log_console(driver)
        driver.save_screenshot("test_failure.png")
    finally:
        driver.quit()

if __name__ == "__main__":
    test_full_flow()
