'use strict';

(() => {
  const THEME_KEY = 'mystery-vault-theme';
  const root = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');

  if (window.mysteryVault?.isWindowsDesktop) {
    root.dataset.desktop = 'windows';
  }

  function renderThemeButton(theme) {
    if (!themeToggle) return;
    const isDark = theme === 'dark';
    themeToggle.setAttribute('aria-pressed', String(!isDark));
    themeToggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
    themeToggle.innerHTML = isDark
      ? '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M8 1.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 1.5Zm0 10.5a.75.75 0 0 1 .75.75v1a.75.75 0 0 1-1.5 0v-1A.75.75 0 0 1 8 12ZM3.4 3.4a.75.75 0 0 1 1.06 0l.7.7a.75.75 0 1 1-1.06 1.06l-.7-.7a.75.75 0 0 1 0-1.06Zm7.44 7.44a.75.75 0 0 1 1.06 0l.7.7a.75.75 0 1 1-1.06 1.06l-.7-.7a.75.75 0 0 1 0-1.06ZM1.5 8a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1A.75.75 0 0 1 1.5 8Zm10.5 0a.75.75 0 0 1 .75-.75h1a.75.75 0 0 1 0 1.5h-1A.75.75 0 0 1 12 8ZM3.4 12.6a.75.75 0 0 1 0-1.06l.7-.7a.75.75 0 1 1 1.06 1.06l-.7.7a.75.75 0 0 1-1.06 0Zm7.44-7.44a.75.75 0 0 1 0-1.06l.7-.7a.75.75 0 1 1 1.06 1.06l-.7.7a.75.75 0 0 1-1.06 0ZM8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"/></svg><span>Light mode</span>'
      : '<svg class="nav-icon" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6.2 1.7a.75.75 0 0 1 .57.93A4.75 4.75 0 0 0 13.37 9.23a.75.75 0 0 1 .93.57 6.25 6.25 0 1 1-8.1-8.1Z"/></svg><span>Dark mode</span>';
  }

  function applyTheme(theme, persist = false) {
    const normalized = theme === 'light' ? 'light' : 'dark';
    root.dataset.theme = normalized;
    if (persist) localStorage.setItem(THEME_KEY, normalized);
    renderThemeButton(normalized);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = normalized === 'dark' ? '#202020' : '#f3f3f3';
    if (window.mysteryVault?.setWindowTheme) {
      void window.mysteryVault.setWindowTheme(normalized).catch(() => {});
    }
  }

  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    applyTheme(saved, false);
  } else if (window.mysteryVault?.getSystemTheme) {
    const fallback = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    applyTheme(fallback, false);
    void window.mysteryVault.getSystemTheme().then(systemTheme => {
      if (!localStorage.getItem(THEME_KEY)) applyTheme(systemTheme, false);
    }).catch(() => {});
  } else {
    const preferred = window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    applyTheme(preferred, false);
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
  }
})();
