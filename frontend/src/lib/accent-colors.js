export const ACCENT_COLORS = [
  { id: "amber",   label: "Amber",   light: "38 92% 46%",  fg_light: "20 10% 8%",   dark: "40 95% 55%",  fg_dark: "20 10% 6%",   hex: "#d97706" },
  { id: "blue",    label: "Blue",    light: "210 80% 52%", fg_light: "0 0% 100%",   dark: "210 80% 60%", fg_dark: "0 0% 100%",   hex: "#2e86de" },
  { id: "emerald", label: "Emerald", light: "158 65% 42%", fg_light: "0 0% 100%",   dark: "158 65% 52%", fg_dark: "0 0% 100%",   hex: "#20a177" },
  { id: "gold",    label: "Gold",    light: "43 90% 50%",  fg_light: "20 10% 8%",   dark: "43 90% 58%",  fg_dark: "20 10% 6%",   hex: "#c8870a" },
  { id: "coral",   label: "Coral",   light: "15 92% 55%",  fg_light: "20 10% 8%",   dark: "15 92% 62%",  fg_dark: "20 10% 6%",   hex: "#e84a12" },
  { id: "purple",  label: "Purple",  light: "262 83% 58%", fg_light: "0 0% 100%",   dark: "262 83% 65%", fg_dark: "0 0% 100%",   hex: "#7c3aed" },
  { id: "indigo",  label: "Indigo",  light: "243 75% 59%", fg_light: "0 0% 100%",   dark: "243 75% 66%", fg_dark: "0 0% 100%",   hex: "#4f46e5" },
  { id: "rose",    label: "Rose",    light: "350 89% 60%", fg_light: "0 0% 100%",   dark: "350 89% 67%", fg_dark: "0 0% 100%",   hex: "#f43f5e" },
];

export function applyAccentColor(colorId) {
  const isDark = document.documentElement.classList.contains("dark");
  const preset = ACCENT_COLORS.find(c => c.id === colorId) || ACCENT_COLORS[0];
  const root = document.documentElement;

  root.style.setProperty("--primary", isDark ? preset.dark : preset.light);
  root.style.setProperty("--primary-foreground", isDark ? preset.fg_dark : preset.fg_light);
  root.style.setProperty("--sidebar-primary", isDark ? preset.dark : preset.light);
  root.style.setProperty("--sidebar-primary-foreground", isDark ? preset.fg_dark : preset.fg_light);

  if (colorId) localStorage.setItem("accent_color", colorId);
}

export function getRandomAccentId() {
  return ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)].id;
}

// Call at app boot (before React renders) to prevent FOUC
export function applyStoredAccentColor() {
  const stored = localStorage.getItem("accent_color");
  if (stored && stored !== "amber") applyAccentColor(stored);
}
