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
    const playerSandboxToggle = document.getElementById('player-sandbox-toggle');
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
    const externalStatus = statusBanner;
    const externalConfigPromise = fetch('/api/embed-config', { cache: 'no-store' })
      .then(response => parseJsonResponse(response).then(data => {
        if (!response.ok) throw new Error(data.error || 'Could not load built-in player servers.');
        externalProviders = (Array.isArray(data.providers) ? data.providers : []).map(provider => ({
          ...provider, custom: false, source: 'built-in'
        }));
        populateExternalServerSelect(data.defaultProviderId || '');
        renderImportedServerList();
        return data;
      }))
      .catch(error => {
        console.warn('Could not load built-in player servers:', error);
        return {};
      });
    let customExternalProviders = [];
    let activeExternalPayload = null;
    let activeExternalTitle = '';
    let activeExternalServerId = localStorage.getItem("mysteryVault.defaultServer") || null;
    let activeTvMetadata = null;
    let seriesPickerRequestId = 0;
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

    async function refreshCustomExternalProviders() {
      const response = await fetch('/api/custom-servers', { cache: 'no-store' });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load saved servers.');
      customExternalProviders = Array.isArray(data.servers) ? data.servers : [];
      renderImportedServerList();
      populateExternalServerSelect(activeExternalServerId || '');
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
      const providers = allExternalProviders();
      if (!providers.length) {
        list.innerHTML = '<div class="imported-server-empty">No servers are configured.</div>';
        return;
      }
      list.innerHTML = '<div class="custom-server-title">Current servers</div>' +
        providers.map(provider => {
          const host = provider.urlTemplate ? provider.urlTemplate.replace(/\/embed\/movie\/.*$/, '') : 'Configured in app';
          const removable = provider.custom === true || String(provider.id).startsWith('csv-');
          return '<div class="imported-server-row"><div class="imported-server-copy"><strong>' +
            escapeHtml(provider.name) + '</strong><span class="imported-server-host">' + escapeHtml(host) +
            '</span></div>' + (removable
              ? '<button class="server-delete-btn" type="button" data-delete-server="' + escapeHtml(provider.id) + '" aria-label="Delete ' + escapeHtml(provider.name) + '">Delete</button>'
              : '<span class="server-source-label">Built in</span>') + '</div>';
        }).join('');
    }
    async function saveCustomExternalProviders() {
      const response = await fetch('/api/custom-servers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers: customExternalProviders })
      });
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not save server configuration.');
      customExternalProviders = Array.isArray(data.servers) ? data.servers : customExternalProviders;
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
      return typeof value === 'string' &&
        (/^https?:\/\//i.test(value) || value.startsWith('/api/tmdb-poster/'))
        ? value : POSTER_FALLBACK;
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
      const isTmdb = type === 'tmdb' || Boolean(item.tmdbId && item.mediaType);
      const poster = escapeHtml(posterUrl(isTmdb ? (item.posterUrl || item.poster) : item.poster));
      const provider = type === 'catalog' ? (isTmdb ? 'Scooby-Doo' : 'Curated') : isTmdb ? 'TMDB' : (item.provider || 'Torrent');
      const metaLeft = isTmdb
        ? `${escapeHtml(item.year || 'Year unknown')} · ${item.mediaType === 'movie' ? 'Movie' : 'TV show'}`
        : type === 'catalog' ? escapeHtml(item.year || '') : `Seeds: ${Number(item.seeders || 0).toLocaleString()}`;
      const metaRight = isTmdb ? (item.mediaType === 'movie' ? 'Play movie' : 'View seasons')
        : type === 'catalog' ? 'Quick pick' : (item.quality ? escapeHtml(item.quality) : `${Number(item.score || 0)} score`);
      const animationDelay = `${Math.min(index, 12) * 35}ms`;
      return `<article class="card" style="--card-delay:${animationDelay}" tabindex="0" role="button" data-card-type="${type}" data-index="${index}" aria-label="Select ${title}">
        <div class="poster-wrap"><img src="${poster}" alt="" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='${POSTER_FALLBACK}'"><div class="poster-overlay"></div>
          <span class="provider-pill">${escapeHtml(provider)}</span><span class="play-hint" aria-hidden="true">▶</span></div>
        <div class="card-info"><div class="card-title">${title}</div><div class="meta-row"><span>${metaLeft}</span><span class="meta-tag">${metaRight}</span></div></div>
      </article>`;
    }
    window.MysteryVault = {
      openItem(item) { if (!item) return; if (item.mediaType === "movie" && item.tmdbId) void playExternalPlayer({mediaType:"movie",id:item.tmdbId},item.title); else if (item.mediaType === "tv" && item.tmdbId) void expandTmdbShow(document.createElement("div"),item); else if (item.magnet || item.source) void handleTorrentSelection(item.magnet || item.source,item.title); },
      getCatalogItem(type,index) { return type === "catalog" ? catalogGrid._items?.[index] : type === "tmdb" ? tmdbResults[index] : searchResults[index]; },
      playFile: (source,index,name,resumeAt) => playFile(source,index,name,resumeAt)
    };
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
      searchSection.classList.add('hidden');
      loadMoreButton.classList.add('hidden');
      torrentGrid.innerHTML = '';
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
      searchSection.classList.remove('hidden');

      if (!unifiedResults.length) {
        torrentGrid.innerHTML = `<div class="empty">${escapeHtml(errors[0] || 'No matching results found.')}</div>`;
      }
      if (errors.length) {
        setStatus(`Some results could not be loaded: ${errors.join(' · ')}`, 'error');
      } else {
        setStatus('');
      }
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

    function playFile(source, fileIndex, fileName, resumeAt = 0) {
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
      playerTip.textContent = '';
      nowPlaying.textContent = fileName ? `Streaming · ${fileName}` : 'Now playing';
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.src = `/api/stream-file?source=${encodeURIComponent(source)}&fileIndex=${encodeURIComponent(fileIndex)}`;
      video.addEventListener("loadedmetadata", function restorePosition() { video.removeEventListener("loadedmetadata", restorePosition); if (Number(resumeAt) > 5 && Number(resumeAt) < video.duration - 10) video.currentTime = Number(resumeAt); });
      window.dispatchEvent(new CustomEvent("mysteryvault:play", {detail:{kind:"torrent",source,fileIndex,fileName}}));
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

    async function playExternalPlayer(payload, displayTitle = '', serverId = '', tvMetadata = undefined) {
      if (tvMetadata !== undefined) activeTvMetadata = tvMetadata;
      if (payload.mediaType !== 'tv') activeTvMetadata = null;
      activeExternalPayload = { ...payload }; activeExternalTitle = displayTitle;
      window.dispatchEvent(new CustomEvent("mysteryvault:play", {detail:{kind:"external",payload:{...payload},title:displayTitle}}));
      activeTorrentDownload = null;
      document.getElementById('torrent-download').classList.add('hidden');
      await externalConfigPromise;
      const providers = allExternalProviders();
      const requestedServer = (serverId && providers.some(item => item.id === serverId) ? serverId : '') || activeExternalServerId || externalServerSelect.value || providers[0]?.id || '';
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
        localStorage.setItem("mysteryVault.defaultServer", result.providerId);
        // Use the user's last sandbox choice across episode/server reloads.
        // If they have never changed it, sandbox Vidsrc by default.
        const savedSandboxChoice = localStorage.getItem('mysteryVault.playerSandboxEnabled');
        playerSandboxToggle.checked = savedSandboxChoice === null
          ? String(provider.id || '').toLowerCase().includes('vidsrc')
          : savedSandboxChoice === 'true';
        applyPlayerSandbox();
        video.pause(); video.removeAttribute('src'); video.load(); video.classList.add('hidden');
        externalFrame.classList.remove('hidden'); externalFrame.title = `${result.providerName} external player`;
        nowPlaying.textContent = displayTitle || `External player · ${payload.id}`;
        playerTip.textContent = `Embedded provider: ${result.providerName}. The provider controls playback and availability.`;
        populateExternalServerSelect(result.providerId);
        const isTv = payload.mediaType === 'tv';
        externalEpisodeControl.classList.toggle('hidden', !isTv);
        if (isTv) populateTvPlayerSelectors(payload, activeTvMetadata);
        showModal(playerModal);
        externalFrame.src = result.url;
        externalStatus.textContent = `Opened ${result.providerName}${displayTitle ? ` for ${displayTitle}` : ''}.`;
      } catch (error) { externalStatus.textContent = error.message || 'Could not open external player.'; }
    }

    function applyPlayerSandbox() {
      if (playerSandboxToggle.checked) {
        externalFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-presentation');
      } else {
        externalFrame.removeAttribute('sandbox');
      }
    }
    playerSandboxToggle.addEventListener('change', () => {
      localStorage.setItem('mysteryVault.playerSandboxEnabled', String(playerSandboxToggle.checked));
      applyPlayerSandbox();
    });

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
    async function fetchPlayerSeasonEpisodes(seasonNumber) {
      if (!activeTvMetadata?.showId) return [];
      const response = await fetch(`/api/tv/${encodeURIComponent(activeTvMetadata.showId)}/seasons/${encodeURIComponent(seasonNumber)}/episodes`);
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load episodes for this season.');
      return Array.isArray(data.episodes) ? data.episodes : [];
    }

    function populatePlayerEpisodeOptions(episodes, selectedEpisode = 1) {
      playerEpisodeInput.replaceChildren();
      episodes.forEach(episode => {
        const option = document.createElement('option');
        option.value = String(episode.episodeNumber);
        option.textContent = `E${String(episode.episodeNumber).padStart(2, '0')} · ${episode.name || 'Untitled episode'}`;
        playerEpisodeInput.append(option);
      });
      if (!episodes.some(episode => Number(episode.episodeNumber) === Number(selectedEpisode)) && episodes.length) playerEpisodeInput.value = String(episodes[0].episodeNumber);
      else if (episodes.length) playerEpisodeInput.value = String(selectedEpisode);
      playerEpisodeInput.disabled = !episodes.length;
    }

    function populateTvPlayerSelectors(payload, metadata) {
      playerSeasonInput.replaceChildren();
      const seasons = Array.isArray(metadata?.seasons) ? metadata.seasons : [];
      seasons.forEach(season => {
        const option = document.createElement('option');
        option.value = String(season.seasonNumber);
        option.textContent = season.seasonNumber === 0
          ? `Specials · ${season.name || 'Specials'}`
          : `Season ${season.seasonNumber} · ${season.name || `Season ${season.seasonNumber}`}`;
        playerSeasonInput.append(option);
      });
      if (seasons.length) playerSeasonInput.value = String(payload.season ?? seasons[0].seasonNumber);
      playerSeasonInput.disabled = !seasons.length;
      const episodes = metadata?.seasonNumber === Number(payload.season) && Array.isArray(metadata?.episodes) ? metadata.episodes : [];
      populatePlayerEpisodeOptions(episodes, payload.episode ?? 1);
      playerEpisodeStatus.textContent = seasons.length ? '' : 'Season list unavailable.';
    }

    playerSeasonInput.addEventListener('change', async () => {
      if (!activeExternalPayload || activeExternalPayload.mediaType !== 'tv') return;
      const season = Number(playerSeasonInput.value);
      playerEpisodeInput.disabled = true;
      playerEpisodeStatus.textContent = 'Loading episode list…';
      try {
        const episodes = await fetchPlayerSeasonEpisodes(season);
        activeTvMetadata = { ...(activeTvMetadata || {}), seasonNumber: season, episodes };
        populatePlayerEpisodeOptions(episodes, episodes[0]?.episodeNumber || 1);
        playerEpisodeStatus.textContent = episodes.length ? '' : 'No episodes listed for this season.';
      } catch (error) {
        playerEpisodeInput.replaceChildren();
        playerEpisodeStatus.textContent = error.message || 'Could not load episodes.';
      }
    });

    document.getElementById('player-episode-apply').addEventListener('click', async () => {
      if (!activeExternalPayload || activeExternalPayload.mediaType !== 'tv') return;
      const season = Number(playerSeasonInput.value);
      const episode = Number(playerEpisodeInput.value);
      if (!Number.isInteger(season) || season < 0 || season > 99 || !Number.isInteger(episode) || episode < 1 || episode > 999) {
        playerEpisodeStatus.textContent = 'Choose a valid season and episode.';
        return;
      }
      const seasonName = activeTvMetadata?.seasons?.find(item => Number(item.seasonNumber) === season)?.name || `Season ${season}`;
      const episodeName = activeTvMetadata?.episodes?.find(item => Number(item.episodeNumber) === episode)?.name || `Episode ${episode}`;
      playerEpisodeStatus.textContent = 'Loading selected episode…';
      await playExternalPlayer({ ...activeExternalPayload, season, episode },
        activeExternalTitle.split(' · S')[0] + ' · ' + seasonName + ' · E' + String(episode).padStart(2, '0') + ' ' + episodeName,
        activeExternalServerId || '');
      playerEpisodeStatus.textContent = 'Selected ' + seasonName + ' · E' + String(episode).padStart(2, '0') + ' ' + episodeName + '.';
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
      void refreshCustomExternalProviders().catch(error => {
        serverCsvStatus.textContent = error.message;
        serverCsvStatus.dataset.kind = 'error';
      });
    }
    settingsMenuBtn.addEventListener('click', openSettingsMenu);
    settingsMenuClose.addEventListener('click', closeSettingsMenu);
    settingsBackdrop.addEventListener('click', closeSettingsMenu);
    document.getElementById('imported-server-list').addEventListener('click', async event => {
      const button = event.target.closest('[data-delete-server]');
      if (!button) return;
      const id = button.dataset.deleteServer;
      const provider = customExternalProviders.find(item => item.id === id);
      if (!provider) return;
      button.disabled = true;
      try {
        const response = await fetch('/api/custom-servers?id=' + encodeURIComponent(id), { method: 'DELETE' });
        const data = await parseJsonResponse(response);
        if (!response.ok) throw new Error(data.error || 'Could not delete server.');
        customExternalProviders = Array.isArray(data.servers) ? data.servers : [];
        populateExternalServerSelect(activeExternalServerId || '');
        renderImportedServerList();
        serverCsvStatus.textContent = provider.name + ' was deleted from the app configuration.';
        serverCsvStatus.dataset.kind = 'success';
      } catch (error) {
        button.disabled = false;
        serverCsvStatus.textContent = error.message || 'Could not delete server.';
        serverCsvStatus.dataset.kind = 'error';
      }
    });

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
        await saveCustomExternalProviders();
        populateExternalServerSelect();
        serverCsvStatus.textContent = 'Saved ' + imported.length + ' server' + (imported.length === 1 ? '' : 's') + ' to the app backend.';
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
    const savedPageSize = localStorage.getItem("mysteryVault.pageSize");
    if (savedPageSize && [...pageSizeSelect.options].some(option => option.value === savedPageSize)) pageSizeSelect.value = savedPageSize;
    const savedSourceFilter = localStorage.getItem("mysteryVault.sourceFilter");
    if (savedSourceFilter && [...resultSourceFilter.options].some(option => option.value === savedSourceFilter)) resultSourceFilter.value = savedSourceFilter;
    const savedQualityFilter = localStorage.getItem("mysteryVault.qualityFilter");
    if (savedQualityFilter && [...qualityFilter.options].some(option => option.value === savedQualityFilter)) qualityFilter.value = savedQualityFilter;
    pageSizeSelect.addEventListener("change", () => localStorage.setItem("mysteryVault.pageSize", pageSizeSelect.value));
    resultSourceFilter.addEventListener("change", () => localStorage.setItem("mysteryVault.sourceFilter", resultSourceFilter.value));
    qualityFilter.addEventListener("change", () => localStorage.setItem("mysteryVault.qualityFilter", qualityFilter.value));
    pageSizeSelect.addEventListener('change', () => renderMoreResults(true));
    resultSourceFilter.addEventListener('change', applyResultFilters);
    qualityFilter.addEventListener('change', applyResultFilters);
    document.getElementById('file-close').addEventListener('click', () => hideModal(fileModal));
    document.getElementById('file-cancel').addEventListener('click', () => hideModal(fileModal));
    document.getElementById('episode-picker-close').addEventListener('click', () => hideModal(episodePickerModal));
    episodePickerModal.addEventListener('click', event => { if (event.target === episodePickerModal) hideModal(episodePickerModal); });
    document.getElementById('player-close').addEventListener('click', closePlayer);
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
      const response = await fetch(`/api/tv/${encodeURIComponent(item.tmdbId)}/seasons/${encodeURIComponent(seasonNumber)}/episodes`);
      const data = await parseJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Could not load this season.');
      const seasonEpisodes = Array.isArray(data.episodes) ? data.episodes : [];
      episodesContainer.replaceChildren();
      if (!seasonEpisodes.length) {
        episodesContainer.innerHTML = '<div class="empty">No episodes are listed for this season.</div>';
        return seasonEpisodes;
      }
      seasonEpisodes.forEach(episode => {
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
          const season = Number(seasonNumber);
          hideModal(episodePickerModal);
          await playExternalPlayer({
            mediaType: 'tv', id: item.tmdbId, season, episode: episode.episodeNumber
          }, `${item.title} · S${season}E${episode.episodeNumber} · ${episode.name || ''}`,
          item.defaultServerId || '', {
            showId: item.tmdbId, seasons: item._tmdbSeasons || [],
            episodes: seasonEpisodes, seasonNumber: season
          });
        });
        episodesContainer.append(button);
      });
      return seasonEpisodes;
    }

    async function expandTmdbShow(card, item) {
      const requestId = ++seriesPickerRequestId;
      document.getElementById('episode-picker-title').textContent = item.title || 'Choose an episode';
      setStatus(`Opening ${item.title || 'series'}…`);
      try {
        const response = await fetch(`/api/tv/${encodeURIComponent(item.tmdbId)}/seasons`);
        const data = await parseJsonResponse(response);
        if (!response.ok) throw new Error(data.error || 'Could not load seasons.');
        const seasons = Array.isArray(data.seasons) ? data.seasons : [];
        const details = document.createElement('div');
        details.className = 'tmdb-series-details episode-picker-details';
        if (!seasons.length) {
          details.innerHTML = '<div class="section-note">No seasons are listed for this show.</div>';
          if (requestId !== seriesPickerRequestId) return;
          episodePickerContent.replaceChildren(details);
          showModal(episodePickerModal);
          setStatus('');
          return;
        }
        item._tmdbSeasons = seasons;
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
        select.addEventListener('change', async event => {
          event.stopPropagation();
          try { await loadSelected(); }
          catch (error) { episodes.innerHTML = `<div class="empty">${escapeHtml(error.message || 'Could not load episodes.')}</div>`; }
        });
        await loadSelected();
        if (requestId !== seriesPickerRequestId) return;
        episodePickerContent.replaceChildren(details);
        showModal(episodePickerModal);
        setStatus('');
      } catch (error) {
        if (requestId !== seriesPickerRequestId) return;
        const details = document.createElement('div');
        details.className = 'tmdb-series-details episode-picker-details';
        details.innerHTML = `<div class="section-note">${escapeHtml(error.message || 'Could not load seasons.')}</div>`;
        episodePickerContent.replaceChildren(details);
        showModal(episodePickerModal);
        setStatus('');
      }
    }
    function handleCardActivation(event) {
      if (event.target.closest('.tmdb-series-details')) return;
      const card = event.target.closest('[data-card-type]');
      if (!card) return;
      const index = Number(card.dataset.index);
      const type = card.dataset.cardType;
      if (type === 'tmdb' || (type === 'catalog' && catalogGrid._items?.[index]?.tmdbId)) {
        const item = type === 'tmdb' ? tmdbResults[index] : catalogGrid._items[index];
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
      if (item?.magnet || item?.source) handleTorrentSelection(type === 'catalog' ? item.magnet : item.source, item.title);
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
      localStorage.setItem('mystery-vault-theme', next);
      themeToggle.innerHTML = next === 'dark' ? '☼ <span>Light mode</span>' : '☾ <span>Dark mode</span>';
      document.querySelector('meta[name="theme-color"]').content = next === 'dark' ? '#0b1020' : '#f4f6fc';
    });

    const savedTheme = localStorage.getItem('mystery-vault-theme');
    if (savedTheme === 'light') {
      document.documentElement.dataset.theme = 'light';
      themeToggle.innerHTML = '☾ <span>Dark mode</span>';
      document.querySelector('meta[name="theme-color"]').content = '#f4f6fc';
    }
    void Promise.all([externalConfigPromise, refreshCustomExternalProviders()])
      .then(() => { renderImportedServerList(); populateExternalServerSelect(); })
      .catch(error => console.warn('Could not load saved external servers:', error));
    loadCatalog();
