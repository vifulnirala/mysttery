'use strict';
    const catalogGrid = document.getElementById('catalog-grid');
    const torrentGrid = document.getElementById('torrent-grid');
    const searchSection = document.getElementById('search-results-section');
    const searchInput = document.getElementById('search');
    const statusBanner = document.getElementById('status-banner');
    const fileModal = document.getElementById('file-modal');
    const modalTorrentTitle = document.getElementById('modal-torrent-title');
    const fileListContainer = document.getElementById('file-list-container');
    const playerModal = document.getElementById('player-modal');
    const nowPlaying = document.getElementById('now-playing');
    const video = document.getElementById('video-element');
    const externalFrame = document.getElementById('external-player-frame');
    const externalPlayerControls = document.getElementById('external-player-controls');
    const externalServerControl = document.getElementById('external-server-control');
    const externalServerSelect = document.getElementById('external-server-select');
    const externalServerStatus = document.getElementById('external-server-status');
    const externalEpisodeControl = document.getElementById('external-episode-control');
    const sandboxToggle = document.getElementById('external-sandbox-toggle');
    const SANDBOX_KEY = 'mystery-vault-player-sandbox';
    let sandboxEnabled = localStorage.getItem(SANDBOX_KEY) !== 'false';
    if (sandboxToggle) sandboxToggle.checked = sandboxEnabled;
    const playerSeasonInput = document.getElementById('player-season');
    const playerEpisodeInput = document.getElementById('player-episode');
    const playerEpisodeStatus = document.getElementById('player-episode-status');
    const episodePickerModal = document.getElementById('episode-picker-modal');
    const episodePickerContent = document.getElementById('episode-picker-content');
    let externalProviders = [];
    let activeExternalPayload = null;
    let activeExternalTitle = '';
    let activeExternalServerId = null;
    const playerTip = document.getElementById('player-tip');
    let currentPlaybackMode = 'torrent';
    const loadMoreButton = document.getElementById('load-more');
    const pageSizeSelect = document.getElementById('page-size');
    const resultSourceFilter = document.getElementById('result-source-filter');
    const qualityFilter = document.getElementById('quality-filter');
    const qualityFilterWrap = document.getElementById('quality-filter-wrap');
    let searchResults = [];
    let tmdbResults = [];
    let unifiedResults = [];
    let filteredResults = [];
    let visibleCount = 0;
    let currentSource = null;
    let searchController = null;
    let tmdbController = null;
    let selectionController = null;
    const POSTER_FALLBACK = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600"><rect width="400" height="600" fill="#18213a"/><text x="200" y="285" fill="#a78bfa" font-size="54" text-anchor="middle">✦</text><text x="200" y="340" fill="#aab4ce" font-family="sans-serif" font-size="20" text-anchor="middle">No poster available</text></svg>');

    function setStatus(message, kind = '') {
      statusBanner.textContent = message;
      statusBanner.dataset.kind = kind;
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }
    function posterUrl(value) {
      return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : POSTER_FALLBACK;
    }
    function showModal(modal) { modal.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function hideModal(modal) {
      modal.classList.remove('open');
      if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
    }
    function formatSize(size) {
      const n = Number(size);
      return Number.isFinite(n) && n > 0 ? `${n.toLocaleString()} MB` : 'Size unknown';
    }
    const WATCHLIST_KEY = 'mystery-vault-watchlist-v1';
    function getWatchlist() { try { const parsed = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]'); return Array.isArray(parsed) ? parsed : []; } catch (_) { return []; } }
    function saveWatchlist(items) { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items)); }
    function makeWatchlistItem(item, type) {
      const isTmdb = type === 'tmdb';
      return { id: isTmdb ? `tmdb:${item.mediaType}:${item.tmdbId}` : `${type}:${item.id || item.source || item.magnet}`, title: item.title || 'Untitled', year: item.year || '',
        poster: posterUrl(isTmdb ? item.posterUrl : item.poster), type, mediaType: item.mediaType || null, tmdbId: item.tmdbId || null,
        source: item.source || item.magnet || null, provider: item.provider || (isTmdb ? 'TMDB' : type === 'catalog' ? 'Curated' : 'Torrent'),
        quality: item.quality || null, torrentType: item.torrentType || null };
    }
    function isWatchlisted(id) { return getWatchlist().some(item => item.id === id); }
    function toggleWatchlist(item) { const items = getWatchlist(); const index = items.findIndex(existing => existing.id === item.id); if (index >= 0) items.splice(index, 1); else items.unshift(item); saveWatchlist(items); return index < 0; }
    function cardMarkup(item, index, type) {
      const title = escapeHtml(item.title);
      const poster = escapeHtml(posterUrl(type === 'tmdb' ? item.posterUrl : item.poster));
      const isTmdb = type === 'tmdb';
      const provider = type === 'catalog' ? 'Curated' : isTmdb ? 'TMDB' : (item.provider || 'Torrent');
      const metaLeft = type === 'catalog'
        ? escapeHtml(item.year || '')
        : isTmdb
          ? `${escapeHtml(item.year || 'Year unknown')} · ${item.mediaType === 'movie' ? 'Movie' : 'TV show'}`
          : `Seeds: ${Number(item.seeders || 0).toLocaleString()}`;
      const metaRight = type === 'catalog'
        ? 'Quick pick'
        : isTmdb
          ? (item.mediaType === 'movie' ? 'Play movie' : 'View seasons')
          : (item.quality ? escapeHtml(item.quality) : `${Number(item.score || 0)} score`);
      const watchlistItem = makeWatchlistItem(item, type);
      const watchlisted = isWatchlisted(watchlistItem.id);
      return `<article class="card" tabindex="0" role="button" data-card-type="${type}" data-index="${index}" aria-label="Select ${title}">
        <div class="poster-wrap"><img src="${poster}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${POSTER_FALLBACK}'"><div class="poster-overlay"></div>
          <span class="provider-pill">${escapeHtml(provider)}</span><span class="play-hint" aria-hidden="true">▶</span>
          <button class="watchlist-toggle${watchlisted ? ' active' : ''}" type="button" data-watchlist-id="${escapeHtml(watchlistItem.id)}" aria-label="${watchlisted ? 'Remove from watchlist' : 'Add to watchlist'}" title="${watchlisted ? 'Remove from watchlist' : 'Add to watchlist'}">${watchlisted ? '★' : '☆'}</button></div>
        <div class="card-info"><div class="card-title">${title}</div><div class="meta-row"><span>${metaLeft}</span><span class="meta-tag">${metaRight}</span></div></div>
      </article>`;
    }

    async function loadCatalog() {
      try {
        const response = await fetch('/api/library');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const items = await response.json();
        catalogGrid.innerHTML = items.length
          ? items.map((item, index) => cardMarkup(item, index, 'catalog')).join('')
          : '<div class="empty">No curated titles are available right now.</div>';
        catalogGrid._items = items;
      } catch (error) {
        catalogGrid.innerHTML = '<div class="empty">Could not load the curated library. Check that the server is running.</div>';
      }
    }

    async function searchTorrents() {
      const query = searchInput.value.trim();
      // Always search both sources; source and quality choices are post-search filters. 
      const wantsTorrents = true;
      const wantsTmdb = true;

      if (!query) {
        searchSection.classList.add('hidden');
        setStatus('Enter a title to search.');
        searchInput.focus();
        return;
      }

      searchController?.abort();
      tmdbController?.abort();
      searchController = wantsTorrents ? new AbortController() : null;
      tmdbController = wantsTmdb ? new AbortController() : null;
      searchSection.classList.remove('hidden');
      loadMoreButton.classList.add('hidden');
      torrentGrid.innerHTML = '<div class="empty">Searching torrent sources and TMDB…</div>';
      searchResults = [];
      tmdbResults = [];
      unifiedResults = [];
      setStatus(`Searching torrent sources and TMDB for “${query}”…`);

      const tasks = [];
      if (wantsTorrents) {
        tasks.push((async () => {
          const response = await fetch(`/api/torrent-search?q=${encodeURIComponent(query)}&limit=50`, { signal: searchController.signal });
          if (!response.ok) throw new Error(`Torrent search failed (HTTP ${response.status})`);
          const data = await response.json();
          searchResults = Array.isArray(data.results) ? data.results : [];
        })());
      }
      if (wantsTmdb) {
        tasks.push((async () => {
          const response = await fetch(`/api/title-search?q=${encodeURIComponent(query)}`, { signal: tmdbController.signal });
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'TMDB search failed.');
          tmdbResults = Array.isArray(data.results) ? data.results : [];
        })());
      }

      const outcomes = await Promise.allSettled(tasks);
      if ((searchController?.signal.aborted || !wantsTorrents) &&
          (tmdbController?.signal.aborted || !wantsTmdb)) return;

      const errors = outcomes
        .filter(result => result.status === 'rejected' && result.reason?.name !== 'AbortError')
        .map(result => result.reason?.message || 'A search source failed.');
      unifiedResults = [
        ...searchResults.map((item, index) => ({ type: 'search', index })),
        ...tmdbResults.map((item, index) => ({ type: 'tmdb', index }))
      ];
      populateQualityFilter();
      applyResultFilters();

      if (!unifiedResults.length) {
        torrentGrid.innerHTML = `<div class="empty">${escapeHtml(errors[0] || 'No matching results found.')}</div>`;
      }
      const summary = [
        wantsTorrents ? `${searchResults.length} torrent${searchResults.length === 1 ? '' : 's'}` : null,
        wantsTmdb ? `${tmdbResults.length} TMDB title${tmdbResults.length === 1 ? '' : 's'}` : null
      ].filter(Boolean).join(' and ');
      setStatus(errors.length
        ? `Search partially completed: ${errors.join(' · ')}`
        : `Search complete for “${query}”: ${summary}. Upcoming movies are excluded from TMDB results.`,
        errors.length ? 'error' : 'success');
    }

    function qualityKey(item) {
      const text = String(item.quality || item.resolution || '').toLowerCase();
      const match = text.match(/(2160|1440|1080|720|480|360)p?/);
      return match ? `${match[1]}p` : 'unknown';
    }

    function applyResultFilters() {
      const source = resultSourceFilter.value;
      const quality = qualityFilter.value;
      filteredResults = unifiedResults.filter(entry => {
        const item = entry.type === 'tmdb' ? tmdbResults[entry.index] : searchResults[entry.index];
        if (!item) return false;
        if (source !== 'all') {
          if (source === 'yts' && item.provider !== 'YTS') return false;
          if (source === 'archive' && item.provider !== 'Internet Archive') return false;
          if (source === 'tmdb' && entry.type !== 'tmdb') return false;
        }
        if (entry.type === 'search' && quality !== 'all' && qualityKey(item) !== quality) return false;
        return true;
      });
      renderMoreResults(true);
      qualityFilterWrap.classList.toggle('filter-disabled', source === 'tmdb' || !searchResults.length);
    }

    function populateQualityFilter() {
      const qualities = [...new Set(searchResults.map(qualityKey))];
      const ordered = ['2160p', '1440p', '1080p', '720p', '480p', '360p', 'unknown'];
      const available = ordered.filter(value => qualities.includes(value));
      qualityFilter.innerHTML = '<option value="all">All qualities</option>' +
        available.map(value => `<option value="${value}">${value === 'unknown' ? 'Unspecified' : value}</option>`).join('');
      qualityFilter.value = 'all';
      qualityFilterWrap.classList.toggle('filter-disabled', resultSourceFilter.value === 'tmdb' || !searchResults.length);
    }

    function renderMoreResults(reset = false) {
      const batchSize = Number.parseInt(pageSizeSelect.value, 10) || 10;
      if (reset) {
        torrentGrid.innerHTML = '';
        visibleCount = 0;
      }
      const nextCount = Math.min(filteredResults.length, visibleCount + batchSize);
      const slice = filteredResults.slice(visibleCount, nextCount);
      const markup = slice.map(entry => {
        const item = entry.type === 'tmdb' ? tmdbResults[entry.index] : searchResults[entry.index];
        return item ? cardMarkup(item, entry.index, entry.type) : '';
      }).join('');
      torrentGrid.insertAdjacentHTML('beforeend', markup);
      visibleCount = nextCount;
      loadMoreButton.classList.toggle('hidden', visibleCount >= filteredResults.length);
      loadMoreButton.textContent = `Load more results (${filteredResults.length - visibleCount} left) ↓`;
      document.getElementById('results-note').textContent =
        filteredResults.length
          ? `Showing ${visibleCount} of ${filteredResults.length} filtered results (${unifiedResults.length} total).`
          : 'No results match the selected filters.';
      if (!filteredResults.length) torrentGrid.innerHTML = '<div class="empty">No results match these filters. Try changing the source or picture quality.</div>';
    }

    async function handleTorrentSelection(source, title) {
      currentSource = source;
      if (selectionController) selectionController.abort();
      selectionController = new AbortController();
      setStatus(`Inspecting available video files for “${title}”…`);
      try {
        const response = await fetch(`/api/torrent-files?source=${encodeURIComponent(source)}`, { signal: selectionController.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not inspect this source.');
        if (!Array.isArray(data.files) || !data.files.length) {
          setStatus('No supported video files (.mp4, .mkv, .webm) were found in this source.', 'error');
          return;
        }
        setStatus('');
        if (data.files.length === 1) {
          playFile(source, data.files[0].index, data.files[0].name);
        } else {
          modalTorrentTitle.textContent = data.torrentName || title;
          fileListContainer.innerHTML = data.files.map(file =>
            `<button type="button" class="file-item" data-file-index="${Number(file.index)}">
              <span class="file-name">▣ &nbsp;${escapeHtml(file.path || file.name)}</span><span class="file-size">${escapeHtml(formatSize(file.sizeMB))}</span>
            </button>`
          ).join('');
          fileListContainer._source = source;
          fileListContainer._files = data.files;
          showModal(fileModal);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        console.error('Error inspecting torrent files:', error);
        setStatus(error.message || 'Failed to inspect torrent metadata.', 'error');
      }
    }

    function playFile(source, fileIndex, fileName) {
      hideModal(fileModal);
      currentPlaybackMode = 'torrent';
      externalFrame.removeAttribute('src');
      externalFrame.classList.add('hidden');
      externalPlayerControls.classList.add('hidden');
      externalServerControl.classList.add('hidden');
      externalServerStatus.textContent = '';
      activeExternalPayload = null;
      video.classList.remove('hidden');
      playerTip.textContent = 'Tip: use a smaller 720p release with healthy seed availability for faster starts.';
      nowPlaying.textContent = fileName ? `Streaming · ${fileName}` : 'Now playing';
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.src = `/api/stream-file?source=${encodeURIComponent(source)}&fileIndex=${encodeURIComponent(fileIndex)}`;
      showModal(playerModal);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => setStatus('Press play in the video controls to begin playback.'));
      }
    }

    async function closePlayer() {
      const closingMode = currentPlaybackMode;
      video.pause();
      video.removeAttribute('src');
      video.load();
      externalFrame.removeAttribute('src');
      externalFrame.classList.add('hidden');
      video.classList.remove('hidden');
      hideModal(playerModal);
      if (closingMode === 'external') {
        setStatus('External player closed.', 'success');
        return;
      }
      // Server-side endpoint destroys all active torrent sessions, not just the HTTP stream.
      try {
        await fetch('/api/stop-stream', { method: 'POST', keepalive: true });
        setStatus('Player closed. All torrent sessions have been stopped.', 'success');
      } catch (error) {
        setStatus('Player closed, but the server could not confirm torrent cleanup. Check the server log.', 'error');
      }
    }

    const externalStatus = document.getElementById('external-provider-status');
    const externalConfigPromise = fetch('/api/embed-config')
      .then(response => {
        if (!response.ok) throw new Error('Player configuration request failed (' + response.status + ').');
        return response.json();
      })
      .then(config => {
        externalProviders = Array.isArray(config.providers) ? config.providers : [];
        externalStatus.textContent = externalProviders.length
          ? 'Configured servers: ' + externalProviders.map(provider => provider.name).join(', ') + '.'
          : 'No valid external servers found. Check EMBED_SERVERS and each EMBED_<ID>_* setting.';
        return externalProviders;
      })
      .catch(error => {
        externalStatus.textContent = error.message || 'Could not load player server configuration.';
        externalProviders = [];
        return externalProviders;
      });


    async function playExternalPlayer(payload, displayTitle = '', serverId = '') {
      activeExternalPayload = { ...payload }; activeExternalTitle = displayTitle;
      await externalConfigPromise;
      const requestedServer = serverId || activeExternalServerId || externalProviders[0]?.id || '';
      externalStatus.textContent = 'Preparing external player…';
      externalPlayerControls.classList.add('hidden'); externalServerStatus.textContent = ''; playerEpisodeStatus.textContent = '';
      try {
        const response = await fetch('/api/external-player', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, serverId: requestedServer })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not prepare external playback.');
        currentPlaybackMode = 'external'; activeExternalServerId = result.providerId;
        video.pause(); video.removeAttribute('src'); video.load(); video.classList.add('hidden');
        externalFrame.classList.remove('hidden'); externalFrame.title = `${result.providerName} external player`;
        applyExternalSandbox();
        nowPlaying.textContent = displayTitle || `External player · ${payload.id}`;
        playerTip.textContent = `Embedded provider: ${result.providerName}. The provider controls playback and availability.`;
        if (!externalProviders.length) externalProviders = [{ id: result.providerId, name: result.providerName }];
        externalServerSelect.replaceChildren();
        externalProviders.forEach(provider => { const option = document.createElement('option'); option.value = provider.id; option.textContent = provider.name; externalServerSelect.append(option); });
        externalServerSelect.value = result.providerId;
        const isTv = payload.mediaType === 'tv';
        externalEpisodeControl.classList.toggle('hidden', !isTv);
        playerSeasonInput.value = String(payload.season ?? 1);
        playerEpisodeInput.value = String(payload.episode ?? 1);
        showModal(playerModal);
        // Set src only after opening the modal so a fast iframe load cannot beat the load handler.
        externalFrame.src = result.url;
        externalStatus.textContent = `Opened ${result.providerName}${displayTitle ? ` for ${displayTitle}` : ''}.`;
      } catch (error) { externalStatus.textContent = error.message || 'Could not open external player.'; }
    }

    function applyExternalSandbox() {
      if (sandboxEnabled) externalFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
      else externalFrame.removeAttribute('sandbox');
    }
    sandboxToggle?.addEventListener('change', async () => {
      sandboxEnabled = sandboxToggle.checked;
      localStorage.setItem(SANDBOX_KEY, String(sandboxEnabled));
      if (activeExternalPayload && currentPlaybackMode === 'external') await playExternalPlayer(activeExternalPayload, activeExternalTitle, activeExternalServerId || externalServerSelect.value || '');
    });
    externalFrame.addEventListener('load', () => {
      if (currentPlaybackMode === 'external' && playerModal.classList.contains('open')) {
        externalPlayerControls.classList.remove('hidden');
        externalServerControl.classList.toggle('hidden', externalProviders.length < 2);
      }
    });
    externalServerSelect.addEventListener('change', async () => {
      if (!activeExternalPayload || !externalServerSelect.value) return;
      externalServerStatus.textContent = 'Switching server…';
      await playExternalPlayer(activeExternalPayload, activeExternalTitle, externalServerSelect.value);
      externalServerStatus.textContent = `Using ${externalServerSelect.options[externalServerSelect.selectedIndex]?.text || 'selected server'}.`;
    });
    document.getElementById('player-episode-apply').addEventListener('click', async () => {
      if (!activeExternalPayload || activeExternalPayload.mediaType !== 'tv') return;
      const season = Number(playerSeasonInput.value);
      const episode = Number(playerEpisodeInput.value);
      if (!Number.isInteger(season) || season < 0 || season > 99 ||
          !Number.isInteger(episode) || episode < 1 || episode > 999) {
        playerEpisodeStatus.textContent = 'Enter a season from 0–99 and episode from 1–999.';
        return;
      }
      playerEpisodeStatus.textContent = 'Loading selected episode…';
      await playExternalPlayer({ ...activeExternalPayload, season, episode }, activeExternalTitle, activeExternalServerId || '');
      playerEpisodeStatus.textContent = `Selected Season ${season}, Episode ${episode}.`;
    });

    document.getElementById('search-form').addEventListener('submit', event => {
      event.preventDefault();
      searchTorrents();
    });
    loadMoreButton.addEventListener('click', () => renderMoreResults(false));
    pageSizeSelect.addEventListener('change', () => renderMoreResults(true));
    resultSourceFilter.addEventListener('change', applyResultFilters);
    qualityFilter.addEventListener('change', applyResultFilters);
    document.getElementById('file-close').addEventListener('click', () => hideModal(fileModal));
    document.getElementById('file-cancel').addEventListener('click', () => hideModal(fileModal));
    document.getElementById('episode-picker-close').addEventListener('click', () => hideModal(episodePickerModal));
    episodePickerModal.addEventListener('click', event => { if (event.target === episodePickerModal) hideModal(episodePickerModal); });
    document.getElementById('player-close').addEventListener('click', closePlayer);
    fileListContainer.addEventListener('click', event => {
      const button = event.target.closest('[data-file-index]');
      if (!button) return;
      const index = Number(button.dataset.fileIndex);
      const file = (fileListContainer._files || []).find(item => Number(item.index) === index);
      if (file) playFile(fileListContainer._source, index, file.name);
    });
    async function loadTmdbSeasonEpisodes(card, item, seasonNumber, episodesContainer) {
      episodesContainer.innerHTML = '<div class="empty">Loading episodes…</div>';
      try {
        const response = await fetch(`/api/tv/${encodeURIComponent(item.tmdbId)}/seasons/${encodeURIComponent(seasonNumber)}/episodes`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load this season.');
        episodesContainer.replaceChildren();
        if (!data.episodes?.length) {
          episodesContainer.innerHTML = '<div class="empty">No episodes are listed for this season.</div>';
          return;
        }
        data.episodes.forEach(episode => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'episode-choice';
          const number = document.createElement('span');
          number.className = 'episode-number';
          number.textContent = `E${String(episode.episodeNumber).padStart(2, '0')}`;
          const copy = document.createElement('span');
          copy.className = 'episode-copy';
          const name = document.createElement('strong');
          name.className = 'episode-name';
          name.textContent = episode.name || 'Untitled episode';
          const overview = document.createElement('span');
          overview.className = 'episode-overview';
          overview.textContent = episode.overview || 'Select to play this episode';
          copy.append(name, overview);
          const play = document.createElement('span');
          play.className = 'episode-play';
          play.setAttribute('aria-hidden', 'true');
          play.textContent = '▶';
          button.append(number, copy, play);
          button.title = episode.overview || episode.name || '';
          button.addEventListener('click', async clickEvent => {
            clickEvent.stopPropagation();
            hideModal(episodePickerModal);
            await playExternalPlayer({
              mediaType: 'tv', id: item.tmdbId, idType: 'tmdb',
              season: seasonNumber, episode: episode.episodeNumber
            }, `${item.title} · S${seasonNumber}E${episode.episodeNumber} · ${episode.name || ''}`);
          });
          episodesContainer.append(button);
        });
      } catch (error) {
        episodesContainer.innerHTML = `<div class="empty">${escapeHtml(error.message || 'Could not load episodes.')}</div>`;
      }
    }

    async function expandTmdbShow(card, item) {
      episodePickerContent.replaceChildren();
      const details = document.createElement('div');
      details.className = 'tmdb-series-details episode-picker-details';
      details.innerHTML = '<div class="section-note">Loading seasons…</div>';
      episodePickerContent.append(details);
      document.getElementById('episode-picker-title').textContent = item.title || 'Choose an episode';
      showModal(episodePickerModal);
      try {
        const response = await fetch(`/api/tv/${encodeURIComponent(item.tmdbId)}/seasons`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Could not load seasons.');
        const seasons = Array.isArray(data.seasons) ? data.seasons : [];
        details.replaceChildren();
        if (!seasons.length) {
          details.innerHTML = '<div class="section-note">No seasons are listed for this show.</div>';
          return;
        }
        const label = document.createElement('label');
        label.className = 'season-label';
        label.textContent = 'Choose season';
        const select = document.createElement('select');
        select.className = 'select-control season-select';
        seasons.forEach(season => {
          const option = document.createElement('option');
          option.value = season.seasonNumber;
          option.textContent = `${season.name || `Season ${season.seasonNumber}`} · ${season.episodeCount} episodes`;
          select.append(option);
        });
        const episodes = document.createElement('div');
        episodes.className = 'episode-list';
        label.append(select);
        details.append(label, episodes);
        const loadSelected = () => loadTmdbSeasonEpisodes(card, item, select.value, episodes);
        select.addEventListener('change', event => {
          event.stopPropagation();
          loadSelected();
        });
        await loadSelected();
      } catch (error) {
        details.innerHTML = `<div class="section-note">${escapeHtml(error.message || 'Could not load seasons.')}</div>`;
      }
    }

    document.addEventListener('click', event => {
      const button = event.target.closest('.watchlist-toggle');
      if (!button) return;
      event.stopPropagation();
      const card = button.closest('[data-card-type]');
      if (!card) return;
      const index = Number(card.dataset.index);
      const type = card.dataset.cardType;
      const items = type === 'catalog' ? catalogGrid._items : type === 'tmdb' ? tmdbResults : searchResults;
      const item = items?.[index];
      if (!item) return;
      const saved = toggleWatchlist(makeWatchlistItem(item, type));
      button.classList.toggle('active', saved);
      button.textContent = saved ? '★' : '☆';
      button.setAttribute('aria-label', saved ? 'Remove from watchlist' : 'Add to watchlist');
      button.title = saved ? 'Remove from watchlist' : 'Add to watchlist';
      setStatus(saved ? 'Added to watchlist.' : 'Removed from watchlist.', 'success');
    });
    function handleCardActivation(event) {
      if (event.target.closest('.tmdb-series-details')) return;
      const card = event.target.closest('[data-card-type]');
      if (!card) return;
      const index = Number(card.dataset.index);
      const type = card.dataset.cardType;
      if (type === 'tmdb') {
        const item = tmdbResults[index];
        if (!item) return;
        if (item.mediaType === 'movie') {
          void playExternalPlayer({ mediaType: 'movie', id: item.tmdbId, idType: 'tmdb' }, item.title);
        } else {
          void expandTmdbShow(card, item);
        }
        return;
      }
      const items = type === 'catalog' ? catalogGrid._items : searchResults;
      const item = items && items[index];
      if (item) handleTorrentSelection(type === 'catalog' ? item.magnet : item.source, item.title);
    }
    document.addEventListener('click', handleCardActivation);
    document.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('.card')) {
        event.preventDefault();
        event.target.click();
      }
      if (event.key === 'Escape') {
        if (playerModal.classList.contains('open')) closePlayer();
        else if (fileModal.classList.contains('open')) hideModal(fileModal);
      }
    });
    [fileModal, playerModal].forEach(modal => modal.addEventListener('click', event => {
      if (event.target === modal) {
        if (modal === playerModal) closePlayer();
        else hideModal(modal);
      }
    }));

    const themeToggle = document.getElementById('theme-toggle');
    themeToggle.addEventListener('click', () => {
      const root = document.documentElement;
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      themeToggle.innerHTML = next === 'dark' ? '☼ <span>Light mode</span>' : '☾ <span>Dark mode</span>';
      document.querySelector('meta[name="theme-color"]').content = next === 'dark' ? '#0b1020' : '#f4f6fc';
    });


    async function refreshManagedServers() {
      const response = await fetch('/api/embed-config'); const config = await response.json();
      externalProviders = Array.isArray(config.providers) ? config.providers : [];
      const list = document.getElementById('managed-server-list'); if (!list) return;
      list.replaceChildren();
      if (!externalProviders.length) { list.innerHTML = '<p class="section-note">No valid servers configured.</p>'; return; }
      externalProviders.forEach(provider => {
        const row = document.createElement('div'); row.className = 'managed-server-row';
        const name = document.createElement('strong'); name.textContent = provider.name;
        const id = document.createElement('span'); id.textContent = provider.id;
        const remove = document.createElement('button'); remove.className = 'btn btn-secondary'; remove.type = 'button'; remove.textContent = 'Remove';
        remove.addEventListener('click', async () => {
          if (!confirm('Remove ' + provider.name + ' from the player server list?')) return;
          const response = await fetch('/api/embed-servers/' + encodeURIComponent(provider.id), { method: 'DELETE' });
          const result = await response.json(); if (!response.ok) { document.getElementById('server-manager-status').textContent = result.error || 'Could not remove server.'; return; }
          document.getElementById('server-manager-status').textContent = provider.name + ' removed.'; await refreshManagedServers();
        });
        row.append(name,id,remove); list.append(row);
      });
    }
    document.getElementById('server-import-form')?.addEventListener('submit', async event => {
      event.preventDefault(); const file = document.getElementById('server-config-file').files[0]; if (!file) return;
      const status = document.getElementById('server-manager-status'); status.textContent = 'Importing server configuration…';
      try {
        const response = await fetch('/api/embed-servers/import', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content:await file.text()}) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Import failed.');
        status.textContent = 'Imported ' + result.count + ' server(s).'; document.getElementById('server-config-file').value = ''; await refreshManagedServers();
      } catch(error) { status.textContent = error.message || 'Could not import server configuration.'; }
    });
    void refreshManagedServers().catch(error => console.warn('Could not refresh player servers:', error));

    loadCatalog();
    const initialQuery = new URLSearchParams(location.search).get('q');
    if (initialQuery) { searchInput.value = initialQuery; void searchTorrents(); }
