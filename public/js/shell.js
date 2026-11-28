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

  // Shared TMDB artwork resolver for titles that do not have images.
  const artworkCache = new Map();
  const artworkPending = new Map();

  function hasRealImage(url) {
    if (typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    if (/via\.placeholder\.com/i.test(trimmed)) return false;
    return true;
  }

  async function resolveTmdbArtwork({ tmdbId = '', mediaType = '', imdbId = '' } = {}) {
    const cleanTmdb = String(tmdbId || '').trim();
    const cleanImdb = String(imdbId || '').trim();
    const cleanType = mediaType === 'tv' ? 'tv' : mediaType === 'movie' ? 'movie' : '';
    if (!cleanTmdb && !cleanImdb) return null;

    const key = cleanTmdb ? `tmdb:${cleanType}:${cleanTmdb}` : `imdb:${cleanImdb.toLowerCase()}`;
    if (artworkCache.has(key)) return artworkCache.get(key);
    if (artworkPending.has(key)) return artworkPending.get(key);

    const params = new URLSearchParams();
    if (cleanTmdb) params.set('tmdbId', cleanTmdb);
    if (cleanType) params.set('mediaType', cleanType);
    if (!cleanTmdb && cleanImdb) params.set('imdbId', cleanImdb);

    const promise = fetch('/api/tmdb-image?' + params.toString())
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null)
      .then(data => {
        const value = data && (data.posterUrl || data.backdropUrl) ? data : null;
        artworkCache.set(key, value);
        artworkPending.delete(key);
        return value;
      });
    artworkPending.set(key, promise);
    return promise;
  }

  function hydrateImageElement(img, { tmdbId = '', mediaType = '', imdbId = '', kind = 'poster', fallback = '' } = {}) {
    if (!img) return;
    const keyAttr = tmdbId || imdbId;
    if (!keyAttr) return;
    if (img.dataset.tmdbHydrated === '1') return;
    img.dataset.tmdbHydrated = '1';
    void resolveTmdbArtwork({ tmdbId, mediaType, imdbId }).then(art => {
      const targetUrl = kind === 'backdrop'
        ? (art?.backdropUrl || art?.posterUrl)
        : (art?.posterUrl || art?.backdropUrl);
      if (targetUrl && img.isConnected) {
        img.src = targetUrl;
      } else if (fallback && img.isConnected && !hasRealImage(img.src)) {
        img.src = fallback;
      }
    });
  }

  function hydrateMissingImages(container) {
    if (!container) return;
    const imgs = [...container.querySelectorAll('img[data-tmdb-id], img[data-imdb-id]')];
    imgs.forEach(img => {
      const tmdbId = img.dataset.tmdbId || '';
      const imdbId = img.dataset.imdbId || '';
      const mediaType = img.dataset.mediaType || '';
      const kind = img.dataset.imageKind || 'poster';
      if (img.dataset.needsTmdbImage === '1' || !hasRealImage(img.getAttribute('src'))) {
        hydrateImageElement(img, { tmdbId, mediaType, imdbId, kind });
      }
      if (!img.dataset.tmdbErrorBound) {
        img.dataset.tmdbErrorBound = '1';
        img.addEventListener('error', () => {
          if (img.dataset.tmdbHydrated !== '1') {
            hydrateImageElement(img, { tmdbId, mediaType, imdbId, kind });
          }
        }, { once: true });
      }
    });
  }

  window.MysteryVaultImages = Object.freeze({
    hasRealImage,
    resolveTmdbArtwork,
    hydrateImageElement,
    hydrateMissingImages
  });

  // Shared Continue Watching store (localStorage + Electron userData JSON).
  const CW_KEY = 'mystery-vault-continue-watching-v1';
  let cwCache = null;

  function getContinueWatching() {
    if (Array.isArray(cwCache)) return cwCache;
    try {
      const parsed = JSON.parse(localStorage.getItem(CW_KEY) || '[]');
      cwCache = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      cwCache = [];
    }
    return cwCache;
  }

  function saveContinueWatching(items) {
    cwCache = Array.isArray(items) ? items.slice(0, 60) : [];
    localStorage.setItem(CW_KEY, JSON.stringify(cwCache));
    if (window.mysteryVault?.saveContinueWatching) {
      void window.mysteryVault.saveContinueWatching(cwCache).catch(error => console.warn('Could not persist continue watching:', error));
    }
    window.dispatchEvent(new CustomEvent('mystery-vault:continue-watching-updated'));
    return cwCache;
  }

  function upsertContinueWatching(entry) {
    if (!entry || !entry.id) return getContinueWatching();
    const list = [...getContinueWatching()];
    const existingIndex = list.findIndex(item => item.id === entry.id);
    const previous = existingIndex >= 0 ? list[existingIndex] : {};
    const merged = {
      ...previous,
      ...entry,
      poster: hasRealImage(entry.poster) ? entry.poster : (hasRealImage(previous.poster) ? previous.poster : ''),
      backdropUrl: hasRealImage(entry.backdropUrl) ? entry.backdropUrl : (hasRealImage(previous.backdropUrl) ? previous.backdropUrl : ''),
      updatedAt: Date.now()
    };
    if (existingIndex >= 0) list.splice(existingIndex, 1);
    list.unshift(merged);
    return saveContinueWatching(list);
  }

  function removeContinueWatching(id) {
    return saveContinueWatching(getContinueWatching().filter(item => item.id !== id));
  }

  function clearContinueWatching() {
    return saveContinueWatching([]);
  }

  async function syncContinueWatching() {
    if (!window.mysteryVault?.getContinueWatching) return getContinueWatching();
    try {
      const stored = await window.mysteryVault.getContinueWatching();
      const items = Array.isArray(stored) ? stored : getContinueWatching();
      cwCache = items;
      localStorage.setItem(CW_KEY, JSON.stringify(items));
      if (!Array.isArray(stored) && items.length) {
        void window.mysteryVault.saveContinueWatching(items).catch(() => {});
      }
    } catch (error) {
      console.warn('Could not load continue watching history:', error);
    }
    return getContinueWatching();
  }

  window.MysteryVaultContinue = Object.freeze({
    getAll: getContinueWatching,
    saveAll: saveContinueWatching,
    upsert: upsertContinueWatching,
    remove: removeContinueWatching,
    clear: clearContinueWatching,
    sync: syncContinueWatching
  });
})();
