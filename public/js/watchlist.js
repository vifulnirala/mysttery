'use strict';

const KEY = 'mystery-vault-watchlist-v1';
const grid = document.getElementById('watchlist-grid');
const clearBtn = document.getElementById('clear-watchlist');
const fallback = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#2b2b2b"/><text x="200" y="305" fill="#60cdff" font-size="52" text-anchor="middle">✦</text></svg>'
);

let watchlistCache = null;

function read() {
  if (Array.isArray(watchlistCache)) return watchlistCache;
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    watchlistCache = Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    watchlistCache = [];
  }
  return watchlistCache;
}

function write(items) {
  watchlistCache = Array.isArray(items) ? items : [];
  localStorage.setItem(KEY, JSON.stringify(watchlistCache));
  if (window.mysteryVault?.saveWatchlist) {
    void window.mysteryVault.saveWatchlist(watchlistCache).catch(error => console.warn('Could not persist watchlist:', error));
  }
  render();
}

function render() {
  const items = read();
  grid.replaceChildren();
  if (clearBtn) clearBtn.disabled = items.length === 0;
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'watchlist-empty';
    empty.innerHTML = '<span>Your watchlist is empty.</span><a class="btn btn-primary" href="/">Browse library</a>';
    grid.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const el = document.createElement('article');
    el.className = 'watchlist-item';

    const img = document.createElement('img');
    img.className = 'poster';
    img.src = item.poster || fallback;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.onerror = () => {
      img.onerror = null;
      img.src = fallback;
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
    remove.addEventListener('click', () => write(read().filter(x => x.id !== item.id)));

    actions.append(open, remove);
    info.append(title, meta, actions);
    el.append(img, info);
    fragment.append(el);
  });

  grid.append(fragment);
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    if (read().length && confirm('Clear the entire watchlist?')) write([]);
  });
}

async function initializeWatchlist() {
  if (window.mysteryVault?.getWatchlist) {
    try {
      const stored = await window.mysteryVault.getWatchlist();
      const items = Array.isArray(stored) ? stored : read();
      watchlistCache = items;
      localStorage.setItem(KEY, JSON.stringify(items));
      if (!Array.isArray(stored) && items.length) {
        void window.mysteryVault.saveWatchlist(items).catch(error => console.warn('Could not migrate watchlist:', error));
      }
    } catch (error) {
      console.warn('Could not load persistent watchlist:', error);
    }
  }
  render();
}

void initializeWatchlist();