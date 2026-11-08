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
    const playerSeasonInput = document.getElementById('player-season');
    const playerEpisodeInput = document.getElementById('player-episode');
    const playerEpisodeStatus = document.getElementById('player-episode-status');
    const episodePickerModal = document.getElementById('episode-picker-modal');
    const episodePickerContent = document.getElementById('episode-picker-content');
    let externalProviders = [];
    let customExternalProviders = loadCustomExternalProviders();
    let activeExternalPayload = null;
    let activeExternalTitle = '';
    let activeExternalServerId = null;
    const playerTip = document.getElementById('player-tip');
    let currentPlaybackMode = 'torrent';
    let activeTorrentDownload = null;
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

    function loadCustomExternalProviders() {
      try {
        const saved = JSON.parse(localStorage.getItem('mystery-vault-custom-servers') || '[]');
        return Array.isArray(saved) ? saved.filter(item =>
          item && typeof item.id === 'string' && typeof item.name === 'string' &&
          typeof item.urlTemplate === 'string' && /^https:\/\//i.test(item.urlTemplate)
        ) : [];
      } catch (_) { return []; }
    }
    function parseServerConfig(text) {
      const values = {};
      text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const equals = trimmed.indexOf('=');
        if (equals < 1) return;
        const key = trimmed.slice(0, equals).trim();
        let value = trimmed.slice(equals + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
        values[key] = value;
      });
      const ids = String(values.EMBED_SERVERS || '').split(',').map(id => id.trim().toLowerCase()).filter(Boolean);
      const providers = [];
      const seen = new Set();
      ids.forEach(id => {
        if (seen.has(id)) return;
        seen.add(id);
        const prefix = 'EMBED_' + id.toUpperCase();
        const name = String(values[prefix + '_NAME'] || id).trim();
        const baseUrl = String(values[prefix + '_BASE_URL'] || '').trim().replace(/\/+$/, '');
        const moviePath = String(values[prefix + '_MOVIE_PATH_TEMPLATE'] || '').trim();
        const tvPath = String(values[prefix + '_TV_PATH_TEMPLATE'] || '').trim();
        if (!name || !/^https:\/\//i.test(baseUrl) || !moviePath || !tvPath) return;
        const joinUrl = path => /^https:\/\//i.test(path) ? path : baseUrl + '/' + path.replace(/^\/+/, '');
        const movieTemplate = joinUrl(moviePath);
        const tvTemplate = joinUrl(tvPath);
        if (!/^https:\/\//i.test(movieTemplate) || !/^https:\/\//i.test(tvTemplate)) return;
        providers.push({ id: 'csv-' + id, name, urlTemplate: movieTemplate, tvUrlTemplate: tvTemplate, custom: true, source: 'csv' });
      });
      return providers;
    }
    function providerUrl(provider, payload) {
      const template = payload.mediaType === 'tv' && provider.tvUrlTemplate ? provider.tvUrlTemplate : provider.urlTemplate;
      return template.replaceAll('{id}', encodeURIComponent(payload.id))
        .replaceAll('{season}', encodeURIComponent(String(payload.season ?? 1)))
        .replaceAll('{episode}', encodeURIComponent(String(payload.episode ?? 1)));
    }
    function renderImportedServerList() {
      const list = document.getElementById('imported-server-list');
      if (!list) return;
      list.innerHTML = customExternalProviders.length
        ? '<div class="custom-server-title">Imported servers</div>' +
          customExternalProviders.map(provider => '<div class="imported-server-row"><span>' + escapeHtml(provider.name) + '</span><span class="imported-server-host">' + escapeHtml(provider.urlTemplate.replace(/\/embed\/movie\/.*$/, '')) + '</span></div>').join('')
        : '<div class="imported-server-empty">No custom servers imported yet.</div>';
    }
    function saveCustomExternalProviders() {
      localStorage.setItem('mystery-vault-custom-servers', JSON.stringify(customExternalProviders));
      renderImportedServerList();
    }
    function allExternalProviders() {
      return [...externalProviders, ...customExternalProviders];
    }
    function populateExternalServerSelect(selectedId = '') {
      const providers = allExternalProviders();
      if (!externalServerSelect) return;
      externalServerSelect.replaceChildren();
      providers.forEach(provider => {
        const option = document.createElement('option');
        option.value = provider.id;
        option.textContent = provider.name;
        externalServerSelect.append(option);
      });
      if (selectedId && providers.some(provider => provider.id === selectedId)) {
        externalServerSelect.value = selectedId;
      } else if (providers.length) {
        externalServerSelect.value = providers[0].id;
      }
    }

    function setStatus(message, kind = '') {
      statusBanner.textContent = message;
      statusBanner.dataset.kind = kind;
    }
    function escapeHtml(value) {
      return String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
    }
    async function parseJsonResponse(response) {
      const text = await response.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch (_) {
        throw new Error(text ? text.slice(0, 240) : 'Server returned an invalid JSON response.');
      }
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
        const items = await parseJsonResponse(response);
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
          const data = await parseJsonResponse(response);
          searchResults = Array.isArray(data.results) ? data.results : [];
        })());
      }
      if (wantsTmdb) {
        tasks.push((async () => {
          const response = await fetch(`/api/title-search?q=${encodeURIComponent(query)}`, { signal: tmdbController.signal });
          const data = await parseJsonResponse(response);
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
        const data = await parseJsonResponse(response);
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
      activeTorrentDownload = { source, fileIndex, fileName: fileName || 'video-file' };
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
      document.getElementById('torrent-download').classList.remove('hidden');
      showModal(playerModal);
      const playPromise = video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => setStatus('Press play in the video controls to begin playback.'));
      }
    }

    async function closePlayer() {
      const closingMode = currentPlaybackMode;
      activeTorrentDownload = null;
      document.getElementById('torrent-download').classList.add('hidden');
      video.pause();
      video.removeAttribute('src');
      video.load();
      externalFrame.removeAttribute('src');
      externalFrame.classList.add('hidden');
      video.classList.remove('hidden');
      activeExternalPayload = null;
      hideModal(playerModal);
      if (closingMode === 'external') {
        setStatus('External player closed.', 'success');
        return;
      }
      // Do not remove the native torrent handle while the HTTP streaming
      // worker may still be unwinding a closed WebView socket. Removing the
      // handle from that worker could race libtorrent and crash the app.
      // The next torrent selection replaces the previous active torrent, and
      // Activity.onDestroy() performs final cleanup.
      setStatus('Playback closed.', 'success');
    }

    async function playExternalPlayer(payload, displayTitle = '', serverId = '') {
      activeExternalPayload = { ...payload }; activeExternalTitle = displayTitle;
      activeTorrentDownload = null;
      document.getElementById('torrent-download').classList.add('hidden');
      await externalConfigPromise;
      const providers = allExternalProviders();
      const requestedServer = serverId || activeExternalServerId || externalServerSelect.value || providers[0]?.id || '';
      const provider = providers.find(item => item.id === requestedServer);
      if (!provider) {
        statusBanner.textContent = 'Select an external server or add a custom server URL below.';
        return;
      }
      externalStatus.textContent = 'Preparing external player…';
      externalPlayerControls.classList.add('hidden'); externalServerStatus.textContent = ''; playerEpisodeStatus.textContent = '';
      try {
        let result;
        if (provider.custom) {
          result = {
            url: providerUrl(provider, payload),
            providerId: provider.id,
            providerName: provider.name,
            mediaType: payload.mediaType
          };
        } else {
          const response = await fetch('/api/external-player', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, serverId: provider.id })
          });
          result = await parseJsonResponse(response);
          if (!response.ok) throw new Error(result.error || 'Could not prepare external playback.');
        }
        currentPlaybackMode = 'external'; activeExternalServerId = result.providerId;
        // Do not impose an iframe sandbox on third-party players. Several
        // providers reject sandboxed embedding, including custom servers.
        externalFrame.removeAttribute('sandbox');
        video.pause(); video.removeAttribute('src'); video.load(); video.classList.add('hidden');
        externalFrame.classList.remove('hidden'); externalFrame.title = `${result.providerName} external player`;
        nowPlaying.textContent = displayTitle || `External player · ${payload.id}`;
        playerTip.textContent = `Embedded provider: ${result.providerName}. The provider controls playback and availability.`;
        populateExternalServerSelect(result.providerId);
        const isTv = payload.mediaType === 'tv';
        externalEpisodeControl.classList.toggle('hidden', !isTv);
        playerSeasonInput.value = String(payload.season ?? 1);
        playerEpisodeInput.value = String(payload.episode ?? 1);
        showModal(playerModal);
        externalFrame.src = result.url;
        externalStatus.textContent = `Opened ${result.providerName}${displayTitle ? ` for ${displayTitle}` : ''}.`;
      } catch (error) { externalStatus.textContent = error.message || 'Could not open external player.'; }
    }

    externalFrame.addEventListener('load', () => {
      if (currentPlaybackMode === 'external' && playerModal.classList.contains('open')) {
        externalPlayerControls.classList.remove('hidden');
        externalServerControl.classList.toggle('hidden', allExternalProviders().length < 2);
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

    const settingsMenuBtn = document.getElementById('settings-menu-btn');
    const settingsMenuClose = document.getElementById('settings-menu-close');
    const settingsDrawer = document.getElementById('settings-drawer');
    const settingsBackdrop = document.getElementById('settings-backdrop');
    const serverCsvInput = document.getElementById('server-csv-input');
    const serverCsvStatus = document.getElementById('server-csv-status');

    function closeSettingsMenu() {
      settingsDrawer.classList.remove('open');
      settingsDrawer.setAttribute('aria-hidden', 'true');
      settingsMenuBtn.setAttribute('aria-expanded', 'false');
      settingsBackdrop.classList.add('hidden');
      document.body.style.overflow = '';
    }
    function openSettingsMenu() {
      settingsDrawer.classList.add('open');
      settingsDrawer.setAttribute('aria-hidden', 'false');
      settingsMenuBtn.setAttribute('aria-expanded', 'true');
      settingsBackdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      renderImportedServerList();
    }
    settingsMenuBtn.addEventListener('click', openSettingsMenu);
    settingsMenuClose.addEventListener('click', closeSettingsMenu);
    settingsBackdrop.addEventListener('click', closeSettingsMenu);

    serverCsvInput.addEventListener('change', async event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!/\.csv$/i.test(file.name)) {
        serverCsvStatus.textContent = 'Please select a .csv file.';
        serverCsvStatus.dataset.kind = 'error';
        return;
      }
      try {
        serverCsvStatus.textContent = 'Reading server configuration…';
        const fileText = await file.text();
        const imported = parseServerConfig(fileText);
        if (!imported.length) throw new Error('No valid EMBED_* server definitions were found in this CSV.');
        const byId = new Map(customExternalProviders.map(provider => [provider.id, provider]));
        imported.forEach(provider => byId.set(provider.id, provider));
        customExternalProviders = [...byId.values()];
        saveCustomExternalProviders();
        populateExternalServerSelect();
        serverCsvStatus.textContent = 'Imported ' + imported.length + ' server' + (imported.length === 1 ? '' : 's') + ' successfully.';
        serverCsvStatus.dataset.kind = 'success';
      } catch (error) {
        serverCsvStatus.textContent = error.message || 'Could not import the CSV file.';
        serverCsvStatus.dataset.kind = 'error';
      } finally {
        serverCsvInput.value = '';
      }
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
    document.getElementById('torrent-download').addEventListener('click', () => {
      if (!activeTorrentDownload) return;
      const { source, fileIndex, fileName } = activeTorrentDownload;
      const url = '/api/download-file?source=' + encodeURIComponent(source) + '&fileIndex=' + encodeURIComponent(fileIndex);
      if (window.Android && typeof window.Android.downloadTorrent === 'function') {
        window.Android.downloadTorrent(location.origin + url, fileName);
        setStatus('Download started in the background.', 'success');
      } else {
        window.open(url, '_blank');
        setStatus('Preparing download…', 'success');
      }
    });
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
        const data = await parseJsonResponse(response);
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
        const data = await parseJsonResponse(response);
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

    const savedTheme = localStorage.getItem('mystery-vault-theme');
    if (savedTheme === 'light') {
      document.documentElement.dataset.theme = 'light';
      themeToggle.innerHTML = '☾ <span>Dark mode</span>';
      document.querySelector('meta[name="theme-color"]').content = '#f4f6fc';
    }
    loadCatalog();
