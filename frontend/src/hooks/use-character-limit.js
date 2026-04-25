import { useState, useCallback } from "react";

export function useCharacterLimit({ maxLength, initialValue = "" }) {
  const [value, setValue] = useState(initialValue);
  const [characterCount, setCharacterCount] = useState(initialValue.length);

  const handleChange = (e) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      setValue(newValue);
      setCharacterCount(newValue.length);
    }
  };

  const reset = useCallback((newValue = "") => {
    const clamped = newValue.slice(0, maxLength);
    setValue(clamped);
    setCharacterCount(clamped.length);
  }, [maxLength]);

  return { value, characterCount, handleChange, maxLength, reset };
}
