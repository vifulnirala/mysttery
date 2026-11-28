'use strict';

(() => {
  const KEY = 'mystery-vault-watchlist-v1';
  const grid = document.getElementById('watchlist-grid');
  const clearBtn = document.getElementById('clear-watchlist');
  const cwGrid = document.getElementById('continue-watching-grid');
  const clearCwBtn = document.getElementById('clear-continue-watching');
  const cwSection = document.getElementById('continue-watching');
  const savedSection = document.getElementById('saved-watchlist');
  const cwCountEl = document.getElementById('continue-count');
  const savedCountEl = document.getElementById('saved-count');
  const pivotButtons = [...document.querySelectorAll('[data-pivot]')];

  const POSTER_FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#2b2b2b"/><text x="200" y="305" fill="#60cdff" font-size="52" text-anchor="middle">✦</text></svg>'
  );
  const THUMB_FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#2b2b2b"/><text x="320" y="195" fill="#60cdff" font-size="48" text-anchor="middle">▶</text></svg>'
  );

  let watchlistCache = null;
  let activePivot = location.hash === '#continue-watching' ? 'continue' : 'all';

  function setPivot(next) {
    activePivot = next;
    pivotButtons.forEach(btn => {
      const isCurrent = btn.dataset.pivot === activePivot;
      btn.classList.toggle('active', isCurrent);
      btn.setAttribute('aria-selected', String(isCurrent));
    });
    if (cwSection) cwSection.classList.toggle('hidden', activePivot === 'saved');
    if (savedSection) savedSection.classList.toggle('hidden', activePivot === 'continue');
  }

  pivotButtons.forEach(btn => {
    btn.addEventListener('click', () => setPivot(btn.dataset.pivot));
  });

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const hrs = Math.floor(total / 3600);
    const mins = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
  }

  function formatUpdated(timestamp) {
    const diffMs = Date.now() - (Number(timestamp) || 0);
    if (diffMs < 60000) return 'Just now';
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  function readWatchlist() {
    if (Array.isArray(watchlistCache)) return watchlistCache;
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
      watchlistCache = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      watchlistCache = [];
    }
    return watchlistCache;
  }

  function writeWatchlist(items) {
    watchlistCache = Array.isArray(items) ? items : [];
    localStorage.setItem(KEY, JSON.stringify(watchlistCache));
    if (window.mysteryVault?.saveWatchlist) {
      void window.mysteryVault.saveWatchlist(watchlistCache).catch(error => console.warn('Could not persist watchlist:', error));
    }
    renderSavedWatchlist();
  }

  function renderContinueWatching() {
    if (!cwGrid) return;
    const store = window.MysteryVaultContinue;
    const items = store ? store.getAll() : [];
    if (cwCountEl) cwCountEl.textContent = String(items.length);
    if (clearCwBtn) clearCwBtn.disabled = items.length === 0;
    cwGrid.replaceChildren();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'watchlist-empty';
      empty.innerHTML = '<span>Nothing in your watch history yet. Start playing a movie, episode, or stream to resume it here.</span><a class="btn btn-primary" href="/">Browse library</a>';
      cwGrid.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'continue-card';

      const thumbWrap = document.createElement('div');
      thumbWrap.className = 'continue-thumb-wrap';

      const img = document.createElement('img');
      img.className = 'continue-thumb';
      const initialArt = window.MysteryVaultImages?.hasRealImage(item.backdropUrl)
        ? item.backdropUrl
        : window.MysteryVaultImages?.hasRealImage(item.poster)
          ? item.poster
          : THUMB_FALLBACK;
      img.src = initialArt;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (item.tmdbId) {
        img.dataset.tmdbId = item.tmdbId;
        img.dataset.mediaType = item.mediaType || '';
        img.dataset.imageKind = 'backdrop';
      } else if (item.imdbId) {
        img.dataset.imdbId = item.imdbId;
        img.dataset.imageKind = 'backdrop';
      }
      if (initialArt === THUMB_FALLBACK && (item.tmdbId || item.imdbId)) {
        img.dataset.needsTmdbImage = '1';
      }
      img.onerror = () => {
        img.onerror = null;
        if ((item.tmdbId || item.imdbId) && img.dataset.tmdbHydrated !== '1') {
          window.MysteryVaultImages?.hydrateImageElement(img, {
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            imdbId: item.imdbId,
            kind: 'backdrop',
            fallback: THUMB_FALLBACK
          });
        } else {
          img.src = THUMB_FALLBACK;
        }
      };

      const badge = document.createElement('span');
      badge.className = 'provider-pill';
      if (item.mediaType === 'tv' && item.season != null && item.episode != null) {
        badge.textContent = `S${item.season} · E${item.episode}`;
      } else if (item.mode === 'torrent') {
        badge.textContent = item.duration > 0 ? `${formatTime(item.currentTime)} / ${formatTime(item.duration)}` : 'Stream';
      } else {
        badge.textContent = item.provider || 'TMDB';
      }
      thumbWrap.append(img, badge);

      if (item.mode === 'torrent' && item.duration > 0 && item.currentTime > 0) {
        const pct = Math.max(2, Math.min(100, Math.round((item.currentTime / item.duration) * 100)));
        const bar = document.createElement('div');
        bar.className = 'continue-progress';
        bar.innerHTML = `<span style="width:${pct}%"></span>`;
        thumbWrap.append(bar);
      }

      const info = document.createElement('div');
      info.className = 'continue-info';

      const title = document.createElement('div');
      title.className = 'continue-title';
      title.textContent = item.title || 'Untitled';
      title.title = item.title || '';

      const meta = document.createElement('div');
      meta.className = 'continue-meta';
      meta.textContent = [
        item.year,
        item.mediaType === 'tv' ? 'TV Series' : item.mediaType === 'movie' ? 'Movie' : item.provider,
        formatUpdated(item.updatedAt)
      ].filter(Boolean).join(' · ');

      const actions = document.createElement('div');
      actions.className = 'watchlist-actions';

      const resume = document.createElement('a');
      resume.className = 'btn btn-primary';
      resume.href = '/?resume=' + encodeURIComponent(item.id);
      resume.textContent = '▶ Resume';

      const remove = document.createElement('button');
      remove.className = 'btn btn-danger';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => {
        store.remove(item.id);
        renderContinueWatching();
      });

      actions.append(resume, remove);
      info.append(title, meta, actions);
      card.append(thumbWrap, info);
      fragment.append(card);
    });

    cwGrid.append(fragment);
    window.MysteryVaultImages?.hydrateMissingImages(cwGrid);
  }

  function renderSavedWatchlist() {
    if (!grid) return;
    const items = readWatchlist();
    if (savedCountEl) savedCountEl.textContent = String(items.length);
    if (clearBtn) clearBtn.disabled = items.length === 0;
    grid.replaceChildren();

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'watchlist-empty';
      empty.innerHTML = '<span>Your saved watchlist is empty.</span><a class="btn btn-primary" href="/">Browse library</a>';
      grid.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const el = document.createElement('article');
      el.className = 'watchlist-item';

      const img = document.createElement('img');
      img.className = 'poster';
      const hasPoster = window.MysteryVaultImages?.hasRealImage(item.poster);
      img.src = hasPoster ? item.poster : POSTER_FALLBACK;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      if (item.tmdbId) {
        img.dataset.tmdbId = item.tmdbId;
        img.dataset.mediaType = item.mediaType || '';
        if (!hasPoster) img.dataset.needsTmdbImage = '1';
      }
      img.onerror = () => {
        img.onerror = null;
        if (item.tmdbId && img.dataset.tmdbHydrated !== '1') {
          window.MysteryVaultImages?.hydrateImageElement(img, {
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            kind: 'poster',
            fallback: POSTER_FALLBACK
          });
        } else {
          img.src = POSTER_FALLBACK;
        }
      };

      const info = document.createElement('div');
      info.className = 'info';

      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = item.title || 'Untitled';
      title.title = item.title || '';

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = [
        item.year,
        item.provider,
        item.mediaType === 'tv' ? 'Series' : item.mediaType === 'movie' ? 'Movie' : item.quality
      ].filter(Boolean).join(' · ');

      const actions = document.createElement('div');
      actions.className = 'watchlist-actions';

      const open = document.createElement('a');
      open.className = 'btn btn-primary';
      open.href = '/?q=' + encodeURIComponent(item.title || '');
      open.textContent = 'Search';

      const remove = document.createElement('button');
      remove.className = 'btn btn-danger';
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', () => writeWatchlist(readWatchlist().filter(x => x.id !== item.id)));

      actions.append(open, remove);
      info.append(title, meta, actions);
      el.append(img, info);
      fragment.append(el);
    });

    grid.append(fragment);
    window.MysteryVaultImages?.hydrateMissingImages(grid);
  }

  if (clearCwBtn) {
    clearCwBtn.addEventListener('click', () => {
      if (window.MysteryVaultContinue?.getAll().length && confirm('Clear your entire Continue Watching history?')) {
        window.MysteryVaultContinue.clear();
        renderContinueWatching();
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (readWatchlist().length && confirm('Clear your entire saved watchlist?')) writeWatchlist([]);
    });
  }

  async function initialize() {
    setPivot(activePivot);
    await window.MysteryVaultContinue?.sync();
    if (window.mysteryVault?.getWatchlist) {
      try {
        const stored = await window.mysteryVault.getWatchlist();
        const items = Array.isArray(stored) ? stored : readWatchlist();
        watchlistCache = items;
        localStorage.setItem(KEY, JSON.stringify(items));
        if (!Array.isArray(stored) && items.length) {
          void window.mysteryVault.saveWatchlist(items).catch(error => console.warn('Could not migrate watchlist:', error));
        }
      } catch (error) {
        console.warn('Could not load persistent watchlist:', error);
      }
    }
    renderContinueWatching();
    renderSavedWatchlist();
  }

  void initialize();
})();