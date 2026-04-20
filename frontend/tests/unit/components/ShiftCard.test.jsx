import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock component - replace with actual ShiftCard import
const ShiftCard = ({ shift, onSelect, onEdit, onDelete }) => (
  <div data-testid="shift-card">
    <h3>{shift.title}</h3>
    <p>{shift.start_time}</p>
    <p>{shift.location}</p>
    <button onClick={() => onSelect(shift.id)}>View</button>
    <button onClick={() => onEdit(shift.id)}>Edit</button>
    <button onClick={() => onDelete(shift.id)}>Delete</button>
  </div>
);

describe("ShiftCard Component", () => {
  const mockShift = {
    id: "1",
    title: "Morning Shift",
    start_time: "09:00",
    end_time: "17:00",
    location: "Office A",
    max_count: 2
  };

  it("renders shift information", () => {
    render(<ShiftCard shift={mockShift} onSelect={() => {}} onEdit={() => {}} onDelete={() => {}} />);

    expect(screen.getByText("Morning Shift")).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("Office A")).toBeInTheDocument();
  });

  it("displays action buttons", () => {
    render(<ShiftCard shift={mockShift} onSelect={() => {}} onEdit={() => {}} onDelete={() => {}} />);

    expect(screen.getByRole("button", { name: /view/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
  });

  it("calls onSelect when View button clicked", async () => {
    const user = userEvent.setup();
    const mockSelect = vi.fn();

    render(<ShiftCard shift={mockShift} onSelect={mockSelect} onEdit={() => {}} onDelete={() => {}} />);

    const viewButton = screen.getByRole("button", { name: /view/i });
    await user.click(viewButton);

    expect(mockSelect).toHaveBeenCalledWith("1");
  });

  it("calls onEdit when Edit button clicked", async () => {
    const user = userEvent.setup();
    const mockEdit = vi.fn();

    render(<ShiftCard shift={mockShift} onSelect={() => {}} onEdit={mockEdit} onDelete={() => {}} />);

    const editButton = screen.getByRole("button", { name: /edit/i });
    await user.click(editButton);

    expect(mockEdit).toHaveBeenCalledWith("1");
  });

  it("calls onDelete when Delete button clicked", async () => {
    const user = userEvent.setup();
    const mockDelete = vi.fn();

    render(<ShiftCard shift={mockShift} onSelect={() => {}} onEdit={() => {}} onDelete={mockDelete} />);

    const deleteButton = screen.getByRole("button", { name: /delete/i });
    await user.click(deleteButton);

    expect(mockDelete).toHaveBeenCalledWith("1");
  });
});
