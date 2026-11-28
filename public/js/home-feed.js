'use strict';

(() => {
  const FALLBACK_POSTER = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#2b2b2b"/><text x="200" y="305" fill="#60cdff" font-size="48" text-anchor="middle">✦</text></svg>'
  );

  function renderShelf(grid, items, emptyText) {
    if (!grid) return;
    grid.replaceChildren();
    if (!Array.isArray(items) || !items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = emptyText;
      grid.append(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const card = document.createElement('article');
      card.className = 'card home-feed-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Open ' + (item.title || 'title'));

      const posterWrap = document.createElement('div');
      posterWrap.className = 'poster-wrap';

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.alt = '';
      img.src = item.posterUrl || FALLBACK_POSTER;
      img.onerror = () => {
        img.onerror = null;
        img.src = FALLBACK_POSTER;
      };

      const overlay = document.createElement('div');
      overlay.className = 'poster-overlay';

      const pill = document.createElement('span');
      pill.className = 'provider-pill';
      pill.textContent = item.mediaType === 'tv' ? 'TMDB · TV' : 'TMDB · Movie';

      const play = document.createElement('span');
      play.className = 'play-hint';
      play.setAttribute('aria-hidden', 'true');
      play.textContent = '▶';

      const watchlistId = `tmdb:${item.mediaType}:${item.tmdbId}`;
      const isSaved = Boolean(window.MysteryVault?.isWatchlisted?.(watchlistId));
      const watchBtn = document.createElement('button');
      watchBtn.type = 'button';
      watchBtn.className = 'watchlist-toggle' + (isSaved ? ' active' : '');
      watchBtn.dataset.homeWatchlist = '1';
      watchBtn.textContent = isSaved ? '★' : '☆';
      watchBtn.setAttribute('aria-label', isSaved ? 'Remove from watchlist' : 'Add to watchlist');
      watchBtn.title = isSaved ? 'Remove from watchlist' : 'Add to watchlist';
      watchBtn.addEventListener('click', event => {
        event.stopPropagation();
        if (!window.MysteryVault?.toggleWatchlistItem) return;
        const saved = window.MysteryVault.toggleWatchlistItem(item, 'tmdb');
        watchBtn.classList.toggle('active', saved);
        watchBtn.textContent = saved ? '★' : '☆';
        watchBtn.setAttribute('aria-label', saved ? 'Remove from watchlist' : 'Add to watchlist');
        watchBtn.title = saved ? 'Remove from watchlist' : 'Add to watchlist';
      });

      posterWrap.append(img, overlay, pill, play, watchBtn);

      const info = document.createElement('div');
      info.className = 'card-info';

      const title = document.createElement('div');
      title.className = 'card-title';
      title.textContent = item.title || 'Untitled';

      const meta = document.createElement('div');
      meta.className = 'meta-row';
      const left = document.createElement('span');
      left.textContent = [item.year, item.mediaType === 'tv' ? 'TV' : 'Movie'].filter(Boolean).join(' · ');
      const right = document.createElement('span');
      right.className = 'meta-tag';
      right.textContent = item.mediaType === 'tv' ? 'Seasons' : 'Play';

      meta.append(left, right);
      info.append(title, meta);
      card.append(posterWrap, info);
      fragment.append(card);

      const open = () => window.MysteryVault?.openItem(item);
      card.addEventListener('click', event => {
        if (event.target.closest('.watchlist-toggle')) return;
        open();
      });
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });

    grid.append(fragment);
  }

  async function loadJson(url, fallback) {
    try {
      const response = await fetch(url);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed.');
      return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
      console.warn('Home feed unavailable:', url, error);
      return fallback;
    }
  }

  const trendingGrid = document.getElementById('trending-grid');
  const feeds = [
    { id: 9648, section: document.getElementById('genre-mystery-section'), grid: document.getElementById('genre-mystery-grid'), name: 'mystery' },
    { id: 10749, section: document.getElementById('genre-romance-section'), grid: document.getElementById('genre-romance-grid'), name: 'romance' },
    { id: 27, section: document.getElementById('genre-horror-section'), grid: document.getElementById('genre-horror-grid'), name: 'horror' },
    { id: 16, section: document.getElementById('genre-animation-section'), grid: document.getElementById('genre-animation-grid'), name: 'animation' },
    { id: 35, section: document.getElementById('genre-comedy-section'), grid: document.getElementById('genre-comedy-grid'), name: 'comedy' }
  ];

  // Load trending immediately; lazy-load genre shelves only when scrolled near the viewport.
  if (trendingGrid) {
    loadJson('/api/trending', []).then(items => {
      renderShelf(trendingGrid, items, 'Trending titles are unavailable right now.');
    });
  }

  function loadGenreFeed(feed) {
    if (!feed.grid || feed.loaded) return;
    feed.loaded = true;
    feed.grid.innerHTML = '<div class="empty">Loading ' + feed.name + ' picks…</div>';
    loadJson('/api/discover?genreId=' + encodeURIComponent(feed.id), []).then(items => {
      renderShelf(feed.grid, items, 'No ' + feed.name + ' titles found right now.');
    });
  }

  if ('IntersectionObserver' in window) {
    const contentPane = document.querySelector('.content-pane');
    const feedBySection = new Map();
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        const feed = feedBySection.get(entry.target);
        if (feed) {
          observer.unobserve(entry.target);
          loadGenreFeed(feed);
        }
      });
    }, { root: contentPane || null, rootMargin: '260px 0px' });

    feeds.forEach(feed => {
      const target = feed.section || feed.grid;
      if (!target) return;
      feedBySection.set(target, feed);
      observer.observe(target);
    });
  } else {
    feeds.forEach(loadGenreFeed);
  }
})();
