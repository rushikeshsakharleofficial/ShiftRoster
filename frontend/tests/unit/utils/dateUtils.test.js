import { describe, it, expect } from "vitest";

// Mock utility functions - replace with actual imports
const formatDate = (date) => {
  return new Date(date).toLocaleDateString();
};

const parseDate = (dateString) => {
  return new Date(dateString);
};

const getDateDifference = (date1, date2) => {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
};

describe("Date Utility Functions", () => {
  describe("formatDate", () => {
    it("formats date correctly", () => {
      const date = new Date("2024-01-15");
      const formatted = formatDate(date);
      expect(formatted).toContain("1/15/2024");
    });

    it("handles different locales", () => {
      const date = new Date("2024-12-25");
      const formatted = formatDate(date);
      expect(formatted).toBeTruthy();
    });
  });

  describe("parseDate", () => {
    it("parses date string correctly", () => {
      const dateString = "2024-01-15";
      const parsed = parseDate(dateString);
      expect(parsed.getFullYear()).toBe(2024);
      expect(parsed.getMonth()).toBe(0);
      expect(parsed.getDate()).toBe(15);
    });

    it("handles ISO format", () => {
      const dateString = "2024-06-15T10:30:00Z";
      const parsed = parseDate(dateString);
      expect(parsed).toBeInstanceOf(Date);
    });
  });

  describe("getDateDifference", () => {
    it("calculates difference between two dates", () => {
      const date1 = "2024-01-01";
      const date2 = "2024-01-11";
      const difference = getDateDifference(date1, date2);
      expect(difference).toBe(10);
    });

    it("returns zero for same dates", () => {
      const date = "2024-01-15";
      const difference = getDateDifference(date, date);
      expect(difference).toBe(0);
    });

    it("handles negative differences", () => {
      const date1 = "2024-01-15";
      const date2 = "2024-01-10";
      const difference = getDateDifference(date1, date2);
      expect(difference).toBeLessThan(0);
    });
  });
});
