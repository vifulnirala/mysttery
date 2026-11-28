'use strict';

(() => {
  const esc = value => {
    const span = document.createElement('span');
    span.textContent = value == null ? '' : String(value);
    return span.innerHTML;
  };

  function renderShelf(grid, items, emptyText) {
    if (!grid) return;
    grid.replaceChildren();
    if (!Array.isArray(items) || !items.length) {
      grid.innerHTML = '<div class="empty">' + esc(emptyText) + '</div>';
      return;
    }

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
      img.src = item.posterUrl || '';
      img.onerror = () => {
        img.onerror = null;
        img.src = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
          '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#18213a"/><text x="200" y="285" fill="#67e8f9" font-size="48" text-anchor="middle">✦</text></svg>'
        );
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

      posterWrap.append(img, overlay, pill, play);

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
      right.textContent = 'Open';

      meta.append(left, right);
      info.append(title, meta);
      card.append(posterWrap, info);
      grid.append(card);

      const open = () => window.MysteryVault?.openItem(item);
      card.addEventListener('click', open);
      card.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          open();
        }
      });
    });
  }

  async function loadJson(url, fallback) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
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
    { id: 9648, grid: document.getElementById('genre-mystery-grid'), name: 'mystery' },
    { id: 10749, grid: document.getElementById('genre-romance-grid'), name: 'romance' },
    { id: 27, grid: document.getElementById('genre-horror-grid'), name: 'horror' },
    { id: 16, grid: document.getElementById('genre-animation-grid'), name: 'animation' },
    { id: 35, grid: document.getElementById('genre-comedy-grid'), name: 'comedy' }
  ];

  if (trendingGrid) {
    loadJson('/api/trending', []).then(items => {
      renderShelf(trendingGrid, items, 'Trending titles are unavailable right now.');
    });
  }

  feeds.forEach(feed => {
    if (!feed.grid) return;
    loadJson('/api/discover?genreId=' + encodeURIComponent(feed.id), []).then(items => {
      renderShelf(feed.grid, items, 'No ' + feed.name + ' titles found right now.');
    });
  });
})();
