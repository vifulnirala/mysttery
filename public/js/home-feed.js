'use strict';

(() => {
  const FALLBACK_POSTER = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#2b2b2b"/><text x="200" y="305" fill="#60cdff" font-size="48" text-anchor="middle">✦</text></svg>'
  );

  // Featured Spotlight Carousel (curated Scooby Vault + top trending TMDB titles)
  const spotlightBanner = document.getElementById('featured-spotlight');
  const spotlightBackdrop = document.getElementById('spotlight-backdrop');
  const spotlightBadgeText = document.getElementById('spotlight-badge-text');
  const spotlightLead = document.getElementById('spotlight-title-lead');
  const spotlightAccent = document.getElementById('spotlight-title-accent');
  const spotlightDesc = document.getElementById('spotlight-desc');
  const spotlightCta = document.getElementById('spotlight-cta');
  const spotlightCtaLabel = document.getElementById('spotlight-cta-label');
  const spotlightDots = document.getElementById('spotlight-dots');
  const spotlightPrev = document.getElementById('spotlight-prev');
  const spotlightNext = document.getElementById('spotlight-next');

  const spotlightSlides = [
    {
      badge: 'SCOOBY VAULT',
      lead: 'The New',
      accent: 'Scooby-Doo Movies',
      desc: 'Discover curated Scooby-Doo mysteries, monsters, and midnight stories handpicked for the vault.',
      cta: 'Explore Now',
      tmdbId: '1068',
      mediaType: 'tv',
      title: 'The New Scooby-Doo Movies',
      backdropUrl: '',
      action: 'search',
      query: 'Scooby-Doo'
    },
    {
      badge: 'SCOOBY VAULT',
      lead: 'Scooby-Doo,',
      accent: 'Where Are You!',
      desc: 'Follow Mystery Inc. through classic haunted castles, ghostly amusement parks, and unmasked villains.',
      cta: 'Explore Now',
      tmdbId: '926',
      mediaType: 'tv',
      title: 'Scooby-Doo, Where Are You!',
      backdropUrl: '',
      action: 'open'
    },
    {
      badge: 'VAULT CLASSIC',
      lead: 'Scooby-Doo on',
      accent: 'Zombie Island',
      desc: 'The gang reunites on Moonscar Island in Louisiana where the monsters are more real than ever.',
      cta: 'Play Now',
      tmdbId: '16471',
      mediaType: 'movie',
      title: 'Scooby-Doo on Zombie Island',
      backdropUrl: '',
      action: 'open'
    }
  ];

  let activeSlideIndex = 0;
  let spotlightTimer = null;
  let spotlightPaused = false;

  function splitHeadline(title) {
    const words = String(title || 'Featured Title').trim().split(/\s+/);
    if (words.length <= 2) return { lead: words[0] || '', accent: words.slice(1).join(' ') || words[0] || '' };
    const splitAt = Math.ceil(words.length / 2);
    return { lead: words.slice(0, splitAt).join(' '), accent: words.slice(splitAt).join(' ') };
  }

  function renderSpotlightDots() {
    if (!spotlightDots) return;
    spotlightDots.replaceChildren();
    const frag = document.createDocumentFragment();
    spotlightSlides.forEach((slide, idx) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'spotlight-dot' + (idx === activeSlideIndex ? ' active' : '');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-selected', String(idx === activeSlideIndex));
      dot.setAttribute('aria-label', `Show featured slide ${idx + 1}: ${slide.title}`);
      dot.addEventListener('click', () => showSpotlightSlide(idx));
      frag.append(dot);
    });
    spotlightDots.append(frag);
  }

  function applySpotlightBackdrop(url) {
    if (!spotlightBackdrop) return;
    if (window.MysteryVaultImages?.hasRealImage(url)) {
      spotlightBackdrop.classList.remove('loaded');
      spotlightBackdrop.onload = () => spotlightBackdrop.classList.add('loaded');
      spotlightBackdrop.onerror = () => spotlightBackdrop.classList.remove('loaded');
      spotlightBackdrop.src = url;
    } else {
      spotlightBackdrop.classList.remove('loaded');
      spotlightBackdrop.removeAttribute('src');
    }
  }

  function showSpotlightSlide(index) {
    if (!spotlightBanner || !spotlightSlides.length) return;
    activeSlideIndex = (index + spotlightSlides.length) % spotlightSlides.length;
    const slide = spotlightSlides[activeSlideIndex];
    const spotlightContent = spotlightBanner.querySelector('.spotlight-content');
    if (spotlightContent) {
      spotlightContent.classList.remove('is-switching');
      void spotlightContent.offsetWidth;
      spotlightContent.classList.add('is-switching');
    }
    if (spotlightBadgeText) spotlightBadgeText.textContent = slide.badge || 'FEATURED';
    if (spotlightLead) spotlightLead.textContent = slide.lead || '';
    if (spotlightAccent) spotlightAccent.textContent = slide.accent || slide.title || '';
    if (spotlightDesc) spotlightDesc.textContent = slide.desc || '';
    if (spotlightCtaLabel) spotlightCtaLabel.textContent = slide.cta || 'Explore Now';
    renderSpotlightDots();

    if (window.MysteryVaultImages?.hasRealImage(slide.backdropUrl)) {
      applySpotlightBackdrop(slide.backdropUrl);
    } else if (slide.tmdbId && window.MysteryVaultImages?.resolveTmdbArtwork) {
      applySpotlightBackdrop('');
      const targetIndex = activeSlideIndex;
      void window.MysteryVaultImages.resolveTmdbArtwork({
        tmdbId: slide.tmdbId,
        mediaType: slide.mediaType
      }).then(art => {
        const resolved = art?.backdropUrl || art?.posterUrl || '';
        if (resolved) {
          slide.backdropUrl = resolved;
          if (!slide.desc && art?.overview) slide.desc = art.overview;
          if (activeSlideIndex === targetIndex) applySpotlightBackdrop(resolved);
        }
      });
    } else {
      applySpotlightBackdrop('');
    }
  }

  function startSpotlightAutoplay() {
    if (spotlightTimer || !spotlightBanner) return;
    spotlightTimer = setInterval(() => {
      if (spotlightPaused || document.visibilityState !== 'visible') return;
      showSpotlightSlide(activeSlideIndex + 1);
    }, 7500);
  }

  if (spotlightBanner) {
    spotlightBanner.addEventListener('mouseenter', () => { spotlightPaused = true; });
    spotlightBanner.addEventListener('mouseleave', () => { spotlightPaused = false; });
    spotlightBanner.addEventListener('focusin', () => { spotlightPaused = true; });
    spotlightBanner.addEventListener('focusout', () => { spotlightPaused = false; });
    spotlightPrev?.addEventListener('click', () => showSpotlightSlide(activeSlideIndex - 1));
    spotlightNext?.addEventListener('click', () => showSpotlightSlide(activeSlideIndex + 1));
    spotlightCta?.addEventListener('click', () => {
      const slide = spotlightSlides[activeSlideIndex];
      if (!slide) return;
      if (slide.action === 'search' && slide.query) {
        const input = document.getElementById('search');
        const form = document.getElementById('search-form');
        if (input && form) {
          input.value = slide.query;
          form.requestSubmit();
        }
      } else if (slide.tmdbId && slide.mediaType) {
        window.MysteryVault?.openItem({
          tmdbId: slide.tmdbId,
          mediaType: slide.mediaType,
          title: slide.title,
          posterUrl: slide.posterUrl || '',
          backdropUrl: slide.backdropUrl || '',
          year: slide.year || ''
        });
      }
    });
    showSpotlightSlide(0);
    startSpotlightAutoplay();
  }

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
      const hasPoster = window.MysteryVaultImages?.hasRealImage(item.posterUrl);
      img.src = hasPoster ? item.posterUrl : FALLBACK_POSTER;
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
            fallback: FALLBACK_POSTER
          });
        } else {
          img.src = FALLBACK_POSTER;
        }
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
    window.MysteryVaultImages?.hydrateMissingImages(grid);
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
    { id: 28, section: document.getElementById('genre-action-section'), grid: document.getElementById('genre-action-grid'), name: 'action' },
    { id: 878, section: document.getElementById('genre-scifi-section'), grid: document.getElementById('genre-scifi-grid'), name: 'sci-fi' },
    { id: 53, section: document.getElementById('genre-thriller-section'), grid: document.getElementById('genre-thriller-grid'), name: 'thriller' },
    { id: 14, section: document.getElementById('genre-fantasy-section'), grid: document.getElementById('genre-fantasy-grid'), name: 'fantasy' },
    { id: 12, section: document.getElementById('genre-adventure-section'), grid: document.getElementById('genre-adventure-grid'), name: 'adventure' },
    { id: 10749, section: document.getElementById('genre-romance-section'), grid: document.getElementById('genre-romance-grid'), name: 'romance' },
    { id: 27, section: document.getElementById('genre-horror-section'), grid: document.getElementById('genre-horror-grid'), name: 'horror' },
    { id: 16, section: document.getElementById('genre-animation-section'), grid: document.getElementById('genre-animation-grid'), name: 'animation' },
    { id: 35, section: document.getElementById('genre-comedy-section'), grid: document.getElementById('genre-comedy-grid'), name: 'comedy' }
  ];

  // Load trending immediately and add top trending backdrop picks to the spotlight carousel.
  if (trendingGrid) {
    loadJson('/api/trending', []).then(items => {
      renderShelf(trendingGrid, items, 'Trending titles are unavailable right now.');
      const spotlightExtras = items.filter(item => item.backdropUrl || item.posterUrl).slice(0, 3);
      spotlightExtras.forEach(item => {
        if (spotlightSlides.some(s => s.tmdbId === item.tmdbId)) return;
        const { lead, accent } = splitHeadline(item.title);
        spotlightSlides.push({
          badge: item.mediaType === 'tv' ? 'TRENDING SERIES' : 'TRENDING MOVIE',
          lead,
          accent,
          desc: item.overview || 'Trending this week on Mystery Vault.',
          cta: item.mediaType === 'tv' ? 'View Episodes' : 'Play Now',
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          title: item.title,
          year: item.year || '',
          posterUrl: item.posterUrl || '',
          backdropUrl: item.backdropUrl || item.posterUrl || '',
          action: 'open'
        });
      });
      renderSpotlightDots();
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

  // Attach looping left/right scroll buttons and low-CPU automatic horizontal scrolling to every shelf (.feed-row).
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const autoScrollShelves = [];

  document.querySelectorAll('.section').forEach((section, shelfIndex) => {
    const row = section.querySelector('.feed-row');
    const head = section.querySelector('.section-head');
    if (!row || !head || head.querySelector('.shelf-scroll-controls')) return;

    const controls = document.createElement('div');
    controls.className = 'shelf-scroll-controls';

    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'shelf-scroll-btn';
    prev.setAttribute('aria-label', 'Scroll left');
    prev.textContent = '‹';

    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'shelf-scroll-btn';
    next.setAttribute('aria-label', 'Scroll right');
    next.textContent = '›';

    const state = {
      section,
      row,
      isVisible: false,
      pausedUntil: 0,
      hovered: false,
      autoEnabled: section.classList.contains('home-feed-section'),
      tickOffset: shelfIndex % 3
    };

    const advanceRow = (dir, cardStep = 0) => {
      const maxScroll = row.scrollWidth - row.clientWidth;
      if (maxScroll <= 12) return;
      const step = cardStep || Math.max(360, Math.round(row.clientWidth * 0.72));
      if (dir > 0) {
        if (row.scrollLeft >= maxScroll - 10) {
          row.scrollTo({ left: 0, behavior: 'smooth' });
        } else {
          row.scrollBy({ left: step, behavior: 'smooth' });
        }
      } else {
        if (row.scrollLeft <= 10) {
          row.scrollTo({ left: maxScroll, behavior: 'smooth' });
        } else {
          row.scrollBy({ left: -step, behavior: 'smooth' });
        }
      }
    };

    prev.addEventListener('click', () => {
      state.pausedUntil = Date.now() + 8000;
      advanceRow(-1);
    });
    next.addEventListener('click', () => {
      state.pausedUntil = Date.now() + 8000;
      advanceRow(1);
    });

    row.addEventListener('mouseenter', () => { state.hovered = true; });
    row.addEventListener('mouseleave', () => { state.hovered = false; });
    row.addEventListener('focusin', () => { state.hovered = true; });
    row.addEventListener('focusout', () => { state.hovered = false; });
    row.addEventListener('wheel', () => { state.pausedUntil = Date.now() + 8000; }, { passive: true });
    row.addEventListener('pointerdown', () => { state.pausedUntil = Date.now() + 8000; }, { passive: true });

    controls.append(prev, next);
    head.append(controls);

    if (state.autoEnabled && !prefersReducedMotion) {
      state.advance = () => advanceRow(1, 380);
      autoScrollShelves.push(state);
    }
  });

  // Single lightweight interval shared across all visible genre shelves (zero CPU when off-screen or hidden).
  if (autoScrollShelves.length && 'IntersectionObserver' in window) {
    const contentPane = document.querySelector('.content-pane');
    const shelfByEl = new Map();
    const visObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const shelf = shelfByEl.get(entry.target);
        if (shelf) shelf.isVisible = entry.isIntersecting;
      });
    }, { root: contentPane || null, threshold: 0.15 });

    autoScrollShelves.forEach(shelf => {
      shelfByEl.set(shelf.section, shelf);
      visObserver.observe(shelf.section);
    });

    let tick = 0;
    setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (document.querySelector('.modal.open')) return;
      const now = Date.now();
      const phase = tick % 3;
      tick += 1;
      autoScrollShelves.forEach(shelf => {
        if (!shelf.isVisible || shelf.hovered || now < shelf.pausedUntil) return;
        if (shelf.tickOffset !== phase) return;
        shelf.advance();
      });
    }, 1400);
  }
})();
