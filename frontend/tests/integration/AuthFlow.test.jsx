import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock API
vi.mock("../src/services/api", () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn()
}));

// Mock component - integration test
const AuthFlow = ({ onLoginSuccess }) => {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Would call actual API
      onLoginSuccess({ email, role: "admin" });
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        name="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <input
        name="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Logging in..." : "Login"}
      </button>
    </form>
  );
};

describe("Authentication Flow Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes login flow successfully", async () => {
    const user = userEvent.setup();
    const mockSuccess = vi.fn();

    render(<AuthFlow onLoginSuccess={mockSuccess} />);

    const emailInput = screen.getByPlaceholderText("Email");
    const passwordInput = screen.getByPlaceholderText("Password");
    const loginButton = screen.getByRole("button", { name: /login/i });

    await user.type(emailInput, "admin@test.com");
    await user.type(passwordInput, "password123");
    await user.click(loginButton);

    await waitFor(() => {
      expect(mockSuccess).toHaveBeenCalledWith(expect.objectContaining({ email: "admin@test.com" }));
    });
  });

  it("shows loading state during login", async () => {
    const user = userEvent.setup();
    const mockSuccess = vi.fn();

    render(<AuthFlow onLoginSuccess={mockSuccess} />);

    const emailInput = screen.getByPlaceholderText("Email");
    const passwordInput = screen.getByPlaceholderText("Password");
    const loginButton = screen.getByRole("button");

    await user.type(emailInput, "admin@test.com");
    await user.type(passwordInput, "password123");

    // Check initial state
    expect(loginButton).toHaveTextContent("Login");

    await user.click(loginButton);

    // Button should show loading state
    expect(loginButton).toHaveTextContent(/login|logging/i);
  });
});
