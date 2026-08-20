const THEME_STORAGE_KEY = 'aldeapucela_theme';
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function getStoredTheme() {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'dark' || saved === 'light' ? saved : null;
  } catch {
    return null;
  }
}

export function getPreferredTheme() {
  const stored = getStoredTheme();
  if (stored) return stored;
  return darkQuery?.matches ? 'dark' : 'light';
}

function updateThemeToggles(theme) {
  const isDark = theme === 'dark';
  const toggles = document.querySelectorAll('[data-theme-toggle]');
  toggles.forEach((button) => {
    button.setAttribute('aria-pressed', String(isDark));
    button.setAttribute('aria-label', isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = isDark ? 'fa-solid fa-sun' : 'fa-regular fa-moon';
    }
    const text = button.querySelector('[data-theme-toggle-label]');
    if (text) {
      text.textContent = isDark ? 'Modo claro' : 'Modo oscuro';
    }
  });
}

export function applyTheme(theme) {
  const nextTheme = theme === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', nextTheme === 'dark');
  root.style.colorScheme = nextTheme;
  updateThemeToggles(nextTheme);
}

export function toggleTheme() {
  const current = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {}
  applyTheme(next);
}

export function initTheme() {
  applyTheme(getPreferredTheme());

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('[data-theme-toggle]');
    if (!toggle) return;
    event.preventDefault();
    toggleTheme();
  });

  if (darkQuery) {
    darkQuery.addEventListener('change', (event) => {
      if (getStoredTheme()) return;
      applyTheme(event.matches ? 'dark' : 'light');
    });
  }
}
