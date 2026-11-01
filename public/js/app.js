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
    const externalServerControl = document.getElementById('external-server-control');
    const externalServerSelect = document.getElementById('external-server-select');
    const externalServerStatus = document.getElementById('external-server-status');
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
      return `<article class="card" tabindex="0" role="button" data-card-type="${type}" data-index="${index}" aria-label="Select ${title}">
        <div class="poster-wrap"><img src="${poster}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${POSTER_FALLBACK}'"><div class="poster-overlay"></div>
          <span class="provider-pill">${escapeHtml(provider)}</span><span class="play-hint" aria-hidden="true">▶</span></div>
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
      const sourceMode = document.getElementById('search-source').value;
      const wantsTorrents = sourceMode !== 'tmdb';
      const wantsTmdb = sourceMode !== 'torrents';

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
      torrentGrid.innerHTML = '<div class="empty">Searching selected sources…</div>';
      searchResults = [];
      tmdbResults = [];
      unifiedResults = [];
      setStatus(`Searching ${sourceMode === 'both' ? 'torrent sources and TMDB' : sourceMode === 'tmdb' ? 'TMDB' : 'torrent sources'} for “${query}”…`);

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
        if (source !== 'all' && entry.type !== source) return false;
        if (entry.type === 'search' && quality !== 'all' && qualityKey(searchResults[entry.index]) !== quality) return false;
        return true;
      });
      renderMoreResults(true);
      qualityFilterWrap.classList.toggle('filter-disabled', source === 'tmdb');
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

    const externalTypeSelect = document.getElementById('external-media-type');
    const externalStatus = document.getElementById('external-provider-status');
    const externalTvFields = [...document.querySelectorAll('.external-tv-field')];
    function updateExternalTypeFields() {
      const isTv = externalTypeSelect.value === 'tv';
      externalTvFields.forEach(field => field.classList.toggle('hidden', !isTv));
      document.getElementById('external-season').required = isTv;
      document.getElementById('external-episode').required = isTv;
    }
    externalTypeSelect.addEventListener('change', updateExternalTypeFields);
    updateExternalTypeFields();
    fetch('/api/embed-config').then(response => response.json()).then(config => {
      externalProviders = Array.isArray(config.providers) ? config.providers : [];
      externalStatus.textContent = config.enabled
        ? `Configured servers: ${externalProviders.map(provider => provider.name).join(', ')}. Use only content you have permission to access.`
        : 'No external servers configured. Check the EMBED_SERVERS and EMBED_<ID>_* environment variables.';
    }).catch(() => { externalStatus.textContent = 'Could not check player server configuration. Confirm the server is running.'; });


    async function playExternalPlayer(payload, displayTitle = '', serverId = '') {
      activeExternalPayload = { ...payload }; activeExternalTitle = displayTitle;
      const requestedServer = serverId || activeExternalServerId || externalProviders[0]?.id || '';
      externalStatus.textContent = 'Preparing external player…';
      externalServerControl.classList.add('hidden'); externalServerStatus.textContent = '';
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
        externalFrame.src = result.url;
        nowPlaying.textContent = displayTitle || `External player · ${payload.id}`;
        playerTip.textContent = `Embedded provider: ${result.providerName}. The provider controls playback and availability.`;
        if (!externalProviders.length) externalProviders = [{ id: result.providerId, name: result.providerName }];
        externalServerSelect.replaceChildren();
        externalProviders.forEach(provider => { const option = document.createElement('option'); option.value = provider.id; option.textContent = provider.name; externalServerSelect.append(option); });
        externalServerSelect.value = result.providerId;
        showModal(playerModal);
        externalStatus.textContent = `Opened ${result.providerName}${displayTitle ? ` for ${displayTitle}` : ''}.`;
      } catch (error) { externalStatus.textContent = error.message || 'Could not open external player.'; }
    }

    externalFrame.addEventListener('load', () => {
      if (currentPlaybackMode === 'external' && playerModal.classList.contains('open'))
        externalServerControl.classList.toggle('hidden', externalProviders.length < 2);
    });
    externalServerSelect.addEventListener('change', async () => {
      if (!activeExternalPayload || !externalServerSelect.value) return;
      externalServerStatus.textContent = 'Switching server…';
      await playExternalPlayer(activeExternalPayload, activeExternalTitle, externalServerSelect.value);
      externalServerStatus.textContent = `Using ${externalServerSelect.options[externalServerSelect.selectedIndex]?.text || 'selected server'}.`;
    });

    document.getElementById('external-player-form').addEventListener('submit', async event => {
      event.preventDefault();
      const payload = {
        mediaType: externalTypeSelect.value,
        id: document.getElementById('external-media-id').value.trim(),
        season: document.getElementById('external-season').value,
        episode: document.getElementById('external-episode').value
      };
      await playExternalPlayer(payload);
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
    document.getElementById('player-close-bottom').addEventListener('click', closePlayer);
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
            document.getElementById('external-media-id').value = item.tmdbId;
            externalTypeSelect.value = 'tv';
            updateExternalTypeFields();
            document.getElementById('external-season').value = seasonNumber;
            document.getElementById('external-episode').value = episode.episodeNumber;
            await playExternalPlayer({
              mediaType: 'tv', id: item.tmdbId,
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
          document.getElementById('external-media-id').value = item.tmdbId;
          externalTypeSelect.value = 'movie';
          updateExternalTypeFields();
          void playExternalPlayer({ mediaType: 'movie', id: item.tmdbId }, item.title);
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

    loadCatalog();
