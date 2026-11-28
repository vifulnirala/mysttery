'use strict';

(() => {
  const grid = document.getElementById('continue-watching-grid');
  const clearBtn = document.getElementById('clear-continue-watching');
  const FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#2b2b2b"/><text x="320" y="195" fill="#60cdff" font-size="48" text-anchor="middle">▶</text></svg>'
  );

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
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  function render() {
    const store = window.MysteryVaultContinue;
    const items = store ? store.getAll() : [];
    grid.replaceChildren();
    if (clearBtn) clearBtn.disabled = items.length === 0;

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'watchlist-empty';
      empty.innerHTML = '<span>Nothing in your watch history yet. Start playing a movie, episode, or stream to resume it here.</span><a class="btn btn-primary" href="/">Browse library</a>';
      grid.append(empty);
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
          : FALLBACK;
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
      if (initialArt === FALLBACK && (item.tmdbId || item.imdbId)) {
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
            fallback: FALLBACK
          });
        } else {
          img.src = FALLBACK;
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
      const parts = [
        item.year,
        item.mediaType === 'tv' ? 'TV Series' : item.mediaType === 'movie' ? 'Movie' : item.provider,
        formatUpdated(item.updatedAt)
      ].filter(Boolean);
      meta.textContent = parts.join(' · ');

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
        render();
      });

      actions.append(resume, remove);
      info.append(title, meta, actions);
      card.append(thumbWrap, info);
      fragment.append(card);
    });

    grid.append(fragment);
    window.MysteryVaultImages?.hydrateMissingImages(grid);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (window.MysteryVaultContinue?.getAll().length && confirm('Clear your entire Continue Watching history?')) {
        window.MysteryVaultContinue.clear();
        render();
      }
    });
  }

  async function init() {
    await window.MysteryVaultContinue?.sync();
    render();
  }

  void init();
})();
