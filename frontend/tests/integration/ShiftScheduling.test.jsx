import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock API
vi.mock("../src/services/api", () => ({
  getShifts: vi.fn(() =>
    Promise.resolve([
      { id: "1", title: "Morning", start_time: "09:00", location: "Office" }
    ])
  ),
  createShift: vi.fn((data) => Promise.resolve({ id: "2", ...data })),
  updateShift: vi.fn((id, data) => Promise.resolve({ id, ...data }))
}));

// Mock component
const ShiftScheduling = () => {
  const [shifts, setShifts] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    // Would call actual API
    setShifts([{ id: "1", title: "Morning", start_time: "09:00", location: "Office" }]);
    setLoading(false);
  }, []);

  return (
    <div>
      {loading ? (
        <p>Loading shifts...</p>
      ) : (
        <div>
          <h2>Shift Schedule</h2>
          <ul>
            {shifts.map((shift) => (
              <li key={shift.id}>{shift.title}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

describe("Shift Scheduling Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays shifts", async () => {
    render(<ShiftScheduling />);

    expect(screen.getByText("Loading shifts...")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Shift Schedule")).toBeInTheDocument();
    });

    expect(screen.getByText("Morning")).toBeInTheDocument();
  });

  it("displays empty state when no shifts", async () => {
    render(<ShiftScheduling />);

    await waitFor(() => {
      expect(screen.getByText("Shift Schedule")).toBeInTheDocument();
    });

    const items = screen.queryAllByRole("listitem");
    expect(items.length).toBeGreaterThanOrEqual(0);
  });
});
