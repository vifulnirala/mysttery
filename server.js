import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import WebTorrent from 'webtorrent';

const app = express();
const port = 3000;
const client = new WebTorrent();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================================
// 1. CONFIGURATION & TRACKERS
// ============================================================================
const TORZNAB_CONFIG = {
  enabled: false,
  baseUrl: process.env.TORZNAB_URL || 'http://localhost:9696/1/api',
  apiKey: process.env.TORZNAB_API_KEY || 'YOUR_PROWLARR_OR_JACKETT_API_KEY'
};

// YTS movie search API. Override this with YTS_API_BASE if needed.
const YTS_API_BASE =
  process.env.YTS_API_BASE || 'https://yts.lt/api/v2/list_movies.json';

// TMDB search is used to look up title metadata and IDs without exposing credentials
// in the browser. Set TMDB_API_READ_ACCESS_TOKEN in the server environment.
const TMDB_API_READ_ACCESS_TOKEN = process.env.TMDB_API_READ_ACCESS_TOKEN || '';

// Retry transient upstream failures using a bounded logarithmic backoff.
// Delays grow as baseDelayMs * ln(attempt + 1), capped to avoid long stalls.
async function fetchWithLogarithmicBackoff(url, options = {}, label = 'upstream API') {
  const maxRetries = Math.max(0, Math.min(4, Number(process.env.UPSTREAM_MAX_RETRIES) || 3));
  const baseDelayMs = Math.max(100, Number(process.env.UPSTREAM_RETRY_BASE_MS) || 800);
  const { timeoutMs = 0, signal: callerSignal, ...fetchOptions } = options;
  const retryableStatuses = [408, 425, 429, 500, 502, 503, 504];
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (callerSignal?.aborted) throw callerSignal.reason || new Error(`${label} request aborted`);

    const controller = new AbortController();
    const forwardAbort = () => controller.abort(callerSignal.reason);
    callerSignal?.addEventListener('abort', forwardAbort, { once: true });
    const timeout = Number(timeoutMs) > 0
      ? setTimeout(() => controller.abort(new Error(`${label} request timed out after ${timeoutMs}ms`)), Number(timeoutMs))
      : null;

    try {
      const response = await fetch(url, { ...fetchOptions, signal: controller.signal });
      if (response.ok || !retryableStatuses.includes(response.status)) return response;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      if (callerSignal?.aborted) throw callerSignal.reason || error;
      lastError = error;
    } finally {
      if (timeout) clearTimeout(timeout);
      callerSignal?.removeEventListener('abort', forwardAbort);
    }

    if (attempt < maxRetries) {
      const delayMs = Math.min(5000, Math.round(baseDelayMs * Math.log(attempt + 2)));
      console.warn(`[${label}] Attempt ${attempt + 1}/${maxRetries + 1} failed; retrying in ${delayMs}ms: ${lastError.message}`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw lastError || new Error(`${label} request failed`);
}


// Optional licensed external-player adapter. Configure a provider you are authorized
// to embed; the browser never submits an arbitrary iframe URL to the server.
const EMBED_PROVIDER = {
  name: process.env.EMBED_PROVIDER_NAME || 'VidSrc',
  baseUrl: process.env.EMBED_PROVIDER_BASE_URL || 'https://vidsrc.sh',
  moviePath: process.env.EMBED_MOVIE_PATH_TEMPLATE || '/embed/movie/{id}',
  tvPath: process.env.EMBED_TV_PATH_TEMPLATE || '/embed/tv/{id}/{season}/{episode}'
};

function getEmbedProviderConfig() {
  if (!EMBED_PROVIDER.baseUrl || !EMBED_PROVIDER.moviePath || !EMBED_PROVIDER.tvPath) return null;
  if (!EMBED_PROVIDER.moviePath.includes('{id}') || !['{id}', '{season}', '{episode}'].every(token => EMBED_PROVIDER.tvPath.includes(token))) return null;
  try {
    const base = new URL(EMBED_PROVIDER.baseUrl);
    if (base.protocol !== 'https:' || base.username || base.password) return null;
    for (const template of [EMBED_PROVIDER.moviePath, EMBED_PROVIDER.tvPath]) {
      if (!template.startsWith('/') || template.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(template)) return null;
      const resolved = new URL(template.replace(/\{(?:id|season|episode)\}/g, 'placeholder'), base);
      if (resolved.origin !== base.origin) return null;
    }
    return { base, name: EMBED_PROVIDER.name, moviePath: EMBED_PROVIDER.moviePath, tvPath: EMBED_PROVIDER.tvPath };
  } catch (_) {
    return null;
  }
}

const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'wss://tracker.openwebtorrent.com'
];

const CATALOG = [
  {
    id: 'sintel-sample',
    title: 'Test Stream (Open-Source Sintel)',
    type: 'test',
    year: 2010,
    poster: 'https://images.metahub.space/poster/medium/tt1727587/img',
    magnet: 'magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2F&xs=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent'
  },
  {
    id: 'scooby-zombie-island',
    title: 'Scooby-Doo on Zombie Island (1998)',
    type: 'movie',
    year: 1998,
    poster: 'https://archive.org/services/img/scooby-doo-on-zombie-island-1998_202309',
    magnet: 'https://archive.org/download/scooby-doo-on-zombie-island-1998_202309/scooby-doo-on-zombie-island-1998_202309_archive.torrent'
  },
  {
    id: 'scooby doo where are you',
    title: 'scooby doo where are you',
    type: 'movie',
    year: 1998,
    poster: 'https://archive.org/services/img/scooby-doo-on-zombie-island-1998_202309',
    magnet: 'magnet:?xt=urn:btih:965855465B8DEB6D982630F4C40DFBE5C3FB38D4&dn=Scooby-Doo+Where+Are+You+1969+S01-S03+1080p+Blu-Ray+H265+10bit+AAC-Zero00&tr=http%3A%2F%2Fp4p.arenabg.com%3A1337%2Fannounce&tr=udp%3A%2F%2F47.ip-51-68-199.eu%3A6969%2Fannounce&tr=udp%3A%2F%2F9.rarbg.me%3A2780%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2710%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2730%2Fannounce&tr=udp%3A%2F%2F9.rarbg.to%3A2920%2Fannounce&tr=udp%3A%2F%2Fopen.stealth.si%3A80%2Fannounce&tr=udp%3A%2F%2Fopentracker.i2p.rocks%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.coppersurfer.tk%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.cyberia.is%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.dler.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.internetwarriors.net%3A1337%2Fannounce&tr=udp%3A%2F%2Ftracker.leechers-paradise.org%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.openbittorrent.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=udp%3A%2F%2Ftracker.pirateparty.gr%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.tiny-vps.com%3A6969%2Fannounce&tr=udp%3A%2F%2Ftracker.torrent.eu.org%3A451%2Fannounce'
  }
];

// ============================================================================
// 2. RELEASE PARSER & STRICT RELEVANCE ENGINE
// ============================================================================
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from']);

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function parseReleaseMetadata(rawTitle) {
  const lower = (rawTitle || '').toLowerCase();
  const cleanTitle = rawTitle
    .replace(/\b(19\d{2}|20\d{2}|720p|1080p|2160p|4k|bluray|webrip|web-dl|brrip|dvdrip|x264|x265|hevc|h264|aac|ac3)\b.*$/i, '')
    .replace(/[._-]+/g, ' ')
    .trim();

  const yearMatch = rawTitle.match(/\b(19\d{2}|20\d{2})\b/);

  return {
    cleanTitle: cleanTitle || rawTitle,
    year: yearMatch ? yearMatch[1] : null,
    resolution: lower.includes('2160p') || lower.includes('4k') ? '4K'
      : lower.includes('1080p') ? '1080p'
      : lower.includes('720p') ? '720p' : 'SD',
    isBrowserCompatibleVideo: !(/\b(x265|h265|hevc|10bit|10-bit|avi|wmv)\b/i.test(lower)),
    isPreferredVideo: /\b(mp4|h264|x264|avc)\b/i.test(lower),
    isIncompatibleAudio: /\b(dts|truehd|atmos|eac3|ddp5)\b/i.test(lower),
    isJunkClip: /\b(commercial|commercials|promo|trailer|opening|closing|sample|bumper|podcast|review|cam|hdcam|ts|telesync)\b/i.test(lower)
  };
}

function calculateTitleSimilarity(candidateTitle, userQuery) {
  const queryTokens = tokenize(userQuery);
  const titleTokens = tokenize(candidateTitle);

  if (queryTokens.length === 0 || titleTokens.length === 0) return 0;

  const titleTokenSet = new Set(titleTokens);
  let matchedCount = 0;

  for (const qWord of queryTokens) {
    if (titleTokenSet.has(qWord)) {
      matchedCount++;
    }
  }

  const coverage = matchedCount / queryTokens.length;
  if (coverage < 1.0) {
    if (queryTokens.length >= 4 && coverage >= 0.75) {
      return coverage * 0.7;
    }
    return 0;
  }

  const normalizedTitle = titleTokens.join(' ');
  const normalizedQuery = queryTokens.join(' ');
  const exactPhraseBonus = normalizedTitle.includes(normalizedQuery) ? 0.25 : 0;
  const lengthRatio = Math.min(1, queryTokens.length / Math.max(queryTokens.length, titleTokens.length - 4));

  return Math.min(1.0, (coverage * 0.75) + exactPhraseBonus) * (0.6 + 0.4 * lengthRatio);
}

function scoreTorrentCandidate(candidate, query = '') {
  const meta = parseReleaseMetadata(candidate.title);
  // Score the title once. Previously the cleaned title and raw title were
  // concatenated, duplicating tokens and making long, unrelated titles score well.
  const similarity = calculateTitleSimilarity(meta.cleanTitle, query);
  const queryTokens = tokenize(query);
  const titleTokens = tokenize(meta.cleanTitle);
  const normalizedQuery = queryTokens.join(' ');
  const normalizedTitle = titleTokens.join(' ');
  const startsWithQuery = Boolean(normalizedQuery) &&
    (normalizedTitle === normalizedQuery || normalizedTitle.startsWith(`${normalizedQuery} `));
  const containsPhrase = Boolean(normalizedQuery) && normalizedTitle.includes(normalizedQuery);

  if (query && similarity === 0) return -999;
  if (meta.isJunkClip) return -500;

  let score = Math.round(similarity * 120);
  // Exact/leading title matches should outrank titles that merely mention the phrase.
  if (startsWithQuery) score += 100;
  else if (containsPhrase) score += 15;
  // Penalize long titles such as episode names and making-of featurettes.
  score -= Math.min(90, Math.max(0, titleTokens.length - queryTokens.length) * 7);

  const seeders = Number(candidate.seeders || 0);
  const sizeMB = Number(candidate.sizeMB || 800);

  if (seeders <= 0) score -= 60;
  else score += Math.min(85, Math.round(Math.log10(seeders + 1) * 28));

  if (!meta.isBrowserCompatibleVideo) score -= 120;
  if (meta.isPreferredVideo) score += 45;
  if (meta.isIncompatibleAudio) score -= 45;

  if (meta.resolution === '1080p') score += 35;
  else if (meta.resolution === '720p') score += 40;
  else if (meta.resolution === '4K') score -= 50;

  if (sizeMB >= 200 && sizeMB <= 2500) score += 30;
  else if (sizeMB < 70 || sizeMB > 5000) score -= 60;

  return score;
}

function refineAndRankTorrents(candidates, query) {
  if (!candidates || candidates.length === 0) return { best: null, results: [] };

  const seen = new Set();
  const unique = candidates.filter(c => {
    const key = (c.source || '').toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const ranked = unique
    .map(c => {
      const meta = parseReleaseMetadata(c.title);
      const score = scoreTorrentCandidate(c, query);
      return {
        ...c,
        resolution: meta.resolution,
        cleanTitle: meta.cleanTitle,
        score
      };
    })
    .filter(c => c.score > 0)
    .sort((a, b) => {
      // Put YTS releases first, then rank within each provider group by stream score.
      const providerPriority = Number(b.provider === 'YTS') - Number(a.provider === 'YTS');
      return providerPriority || (b.score - a.score);
    });

  console.log(`\n[Search Refinement] Kept ${ranked.length} of ${candidates.length} raw results for "${query}":`);
  ranked.slice(0, 5).forEach((c, idx) => {
    console.log(`  #${idx + 1} [Score: ${c.score}] [${c.resolution}] ${c.title} (Seeds: ${c.seeders}, Size: ${c.sizeMB}MB)`);
  });

  return {
    best: ranked[0] || null,
    results: ranked
  };
}

// Search YTS and convert its movie/torrent records into this app's
// existing candidate shape. The returned source is a magnet URI, not a
// direct video URL; the existing server-side WebTorrent routes handle playback.
async function searchYts(query, requestedLimit = 50) {
  const results = [];

  try {
    const url = new URL(YTS_API_BASE);
    url.searchParams.set('query_term', query);
    url.searchParams.set('limit', String(Math.max(1, Math.min(50, Number.parseInt(requestedLimit, 10) || 50))));
    url.searchParams.set('sort_by', 'seeds');
    url.searchParams.set('order_by', 'desc');

    const response = await fetchWithLogarithmicBackoff(url, {
      timeoutMs: Number(process.env.YTS_TIMEOUT_MS) || 15000
    }, 'YTS');

    if (!response.ok) {
      throw new Error(`YTS returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.status !== 'ok') {
      throw new Error(payload?.status_message || 'Unexpected YTS response');
    }

    const movies = payload?.data?.movies || [];
    const trackers = [
      'udp://tracker.opentrackr.org:1337/announce',
      'udp://open.stealth.si:80/announce',
      'udp://tracker.torrent.eu.org:451/announce',
      'udp://tracker.openbittorrent.com:6969/announce'
    ];

    for (const movie of movies) {
      for (const torrent of (movie.torrents || [])) {
        const hash = String(torrent.hash || '').trim();
        if (!/^[a-fA-F0-9]{40}$/.test(hash)) continue;

        const releaseName =
          `${movie.title || 'YTS movie'} (${movie.year || 'Unknown year'}) ` +
          `${torrent.quality || ''} ${torrent.type || ''}`.trim();

        // Keep the exact topic (xt) in its conventional magnet form. Some
        // WebTorrent versions reject a percent-encoded `urn:btih:` prefix,
        // which URLSearchParams would produce (`urn%3Abtih%3A...`). Encode
        // only the display name and tracker values.
        const magnetSource = [
          `xt=urn:btih:${hash}`,
          `dn=${encodeURIComponent(releaseName)}`,
          ...trackers.map(tracker => `tr=${encodeURIComponent(tracker)}`)
        ].join('&');

        let sizeMB = Number(torrent.size_bytes) > 0
          ? Math.round(Number(torrent.size_bytes) / (1024 * 1024))
          : 0;

        // Fallback for API responses that only include a human-readable size.
        if (!sizeMB && torrent.size) {
          const match = String(torrent.size).match(/([\d.]+)\s*(GB|MB|KB)/i);
          if (match) {
            const amount = Number(match[1]);
            const unit = match[2].toUpperCase();
            sizeMB = Math.round(
              unit === 'GB' ? amount * 1024 :
              unit === 'KB' ? amount / 1024 : amount
            );
          }
        }

        results.push({
          title: releaseName,
          year: movie.year || 'YTS',
          seeders: Number(torrent.seeds || 0),
          sizeMB: sizeMB || 800,
          poster: movie.medium_cover_image ||
            movie.large_cover_image ||
            'https://via.placeholder.com/300x450?text=YTS',
          source: `magnet:?${magnetSource}`,
          provider: 'YTS',
          movieId: movie.id,
          quality: torrent.quality || null,
          torrentType: torrent.type || null,
          rating: movie.rating || null
        });
      }
    }

    console.log(`[YTS Provider] Found ${results.length} torrent variants for "${query}".`);
  } catch (err) {
    // Keep other providers usable if YTS is unavailable.
    const cause = err?.cause?.code || err?.cause?.message;
    console.log(`[YTS Provider Notice] ${err.message}${cause ? ` (cause: ${cause})` : ''}`);
  }

  return results;
}

// ============================================================================
// 3. INDEXER PROVIDERS
// ============================================================================
async function searchTorrentIndexers(query, ytsLimit = 50) {
  const results = [];

  if (query.startsWith('magnet:?') || /^[a-fA-F0-9]{40}$/.test(query.trim())) {
    const source = query.startsWith('magnet:?')
      ? query.trim()
      : `magnet:?xt=urn:btih:${query.trim()}`;
    return [{
      title: `Direct Magnet Stream (${query.slice(0, 24)}...)`,
      year: 'Direct',
      seeders: 100,
      sizeMB: 800,
      poster: 'https://via.placeholder.com/300x450?text=Direct+Magnet',
      source,
      provider: 'Direct magnet'
    }];
  }

  if (TORZNAB_CONFIG.enabled) {
    try {
      const url = `${TORZNAB_CONFIG.baseUrl}?t=search&q=${encodeURIComponent(query)}&cat=2000,5000&apikey=${TORZNAB_CONFIG.apiKey}&extended=1&format=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const data = await res.json();
        const items = data?.item || data?.channel?.item || [];
        const list = Array.isArray(items) ? items : [items];
        for (const item of list) {
          const magnetUrl = item.magneturl || item.link;
          if (!magnetUrl) continue;
          results.push({
            title: item.title,
            year: 'Torznab',
            seeders: Number(item.seeders || 20),
            sizeMB: Math.round(Number(item.size || 800000000) / (1024 * 1024)),
            poster: 'https://via.placeholder.com/300x450/1a1b23/facc15?text=Torznab+Stream',
            source: magnetUrl,
            provider: 'Torznab'
          });
        }
      }
    } catch (err) {
      console.log(`[Torznab Notice] Local indexer failed: ${err.message}`);
    }
  }

  // Search providers concurrently so a slow YTS response doesn't delay Archive results.
  const ytsPromise = searchYts(query, ytsLimit);
  const archivePromise = (async () => {
    const archiveResults = [];
    try {
      const tokens = tokenize(query);
      if (tokens.length > 0) {
        const andTitleClause = tokens.map(t => `"${t}"`).join(' AND ');
        const strictIaQuery = `title:(${andTitleClause}) AND mediatype:(movies) AND -title:(commercial OR promo OR trailer OR podcast OR opening)`;
        const iaUrl = `https://archive.org/advancedsearch.php?q=${encodeURIComponent(strictIaQuery)}&fl[]=identifier,title,year,downloads,item_size&sort[]=downloads+desc&rows=15&page=1&output=json`;
        const res = await fetch(iaUrl, { signal: AbortSignal.timeout(5000) });

        if (res.ok) {
          const data = await res.json();
          const docs = data?.response?.docs || [];
          for (const doc of docs) {
            const sizeMB = Math.round((doc.item_size || 0) / (1024 * 1024));
            if (sizeMB < 50) continue;

            archiveResults.push({
              title: `${doc.title} (${doc.year || 'Classic'}) [MP4 x264]`,
              year: doc.year || 'Archive',
              seeders: doc.downloads || 10,
              sizeMB,
              poster: `https://archive.org/services/img/${doc.identifier}`,
              source: `https://archive.org/download/${doc.identifier}/${doc.identifier}_archive.torrent`,
              provider: 'Internet Archive'
            });
          }
        } else {
          console.log(`[Archive Provider Notice] HTTP ${res.status}`);
        }
      }
    } catch (err) {
      console.error(`[Archive Provider Error] ${err.message}`);
    }
    return archiveResults;
  })();

  const [ytsResults, archiveResults] = await Promise.all([ytsPromise, archivePromise]);
  results.push(...ytsResults, ...archiveResults);
  return results;
}

// ============================================================================
// 4. WEBTORRENT SWARM & LIFECYCLE MANAGER
// ============================================================================
const activeTorrents = new Map();
const curatedIds = new Set(CATALOG.map(item => item.id));

function closeEntryStreams(entry) {
  if (!entry?.openStreams) return;

  // Deselect files before clearing bookkeeping; the caller may then destroy the
  // torrent session to ensure no pieces continue downloading in the background.
  const selectedFiles = new Set(entry.streamFiles?.values?.() || []);
  for (const file of entry.pauseTimers?.keys?.() || []) selectedFiles.add(file);
  for (const timer of entry.pauseTimers?.values?.() || []) clearTimeout(timer);
  entry.pauseTimers?.clear();
  for (const stream of [...entry.openStreams]) {
    try { stream.destroy(); } catch (_) {}
  }
  for (const file of selectedFiles) {
    try { file.deselect(); } catch (_) {}
  }
  entry.openStreams.clear();
  entry.streamFiles?.clear();
}

function destroyTorrentEntry(key, entry) {
  if (entry.statsInterval) clearInterval(entry.statsInterval);
  entry.statsInterval = null;
  closeEntryStreams(entry);
  if (entry.torrent && !entry.torrent.destroyed) {
    try { entry.torrent.destroy({ destroyStore: true }); } catch (_) {}
  }
  if (activeTorrents.get(key) === entry) activeTorrents.delete(key);
}

// Any torrent session opened for inspection but not actively streaming is
// removed after a short idle timeout, including curated catalogue items.
const DYNAMIC_IDLE_TIMEOUT_MS = 60 * 1000;
function stopDynamicTorrents() {
  const now = Date.now();
  for (const [key, entry] of activeTorrents.entries()) {
    if (entry.openStreams.size > 0) continue;
    if (now - (entry.lastUsedAt || now) < DYNAMIC_IDLE_TIMEOUT_MS) continue;
    console.log(`[Cleanup] Removing idle torrent session: ${String(key).slice(0, 45)}...`);
    destroyTorrentEntry(key, entry);
  }
}

function stopActiveStreams() {
  for (const entry of activeTorrents.values()) {
    closeEntryStreams(entry);
    entry.lastUsedAt = Date.now();
  }
}

function resolveTorrentSource(source) {
  // The catalogue is warmed by catalogue ID, while the UI passes magnet URLs.
  // Resolve those URLs back to the warmed entry to avoid adding a second swarm.
  const curated = CATALOG.find(item => item.magnet === source);
  return curated
    ? { key: curated.id, source: curated.magnet, isCurated: true }
    : { key: source, source, isCurated: false };
}

function getReadyTorrent(key, torrentSource, isCurated = curatedIds.has(key)) {
  const existing = activeTorrents.get(key);
  if (existing) {
    existing.lastUsedAt = Date.now();
    return existing.promise;
  }

  const entry = {
    promise: null,
    torrent: null,
    statsInterval: null,
    openStreams: new Set(),
    streamFiles: new Map(),
    pauseTimers: new Map(),
    isCurated,
    lastUsedAt: Date.now()
  };

  entry.promise = new Promise((resolve, reject) => {
    console.log(`\n[Torrent] Opening ${isCurated ? 'curated' : 'search'} source on explicit selection: ${String(torrentSource).slice(0, 80)}`);

    let settled = false;
    let torrent;
    try {
      torrent = client.add(torrentSource, { announce: DEFAULT_TRACKERS });
      entry.torrent = torrent;
    } catch (err) {
      if (activeTorrents.get(key) === entry) activeTorrents.delete(key);
      reject(err);
      return;
    }

    torrent.once('error', (err) => {
      console.error(`[Torrent Error] ${err.message}`);
      if (entry.statsInterval) clearInterval(entry.statsInterval);
      entry.statsInterval = null;
      if (!settled) {
        settled = true;
        reject(err);
      }
      if (activeTorrents.get(key) === entry) activeTorrents.delete(key);
    });

    torrent.once('metadata', () => {
      if (settled) return;
      settled = true;
      torrent.setMaxListeners(0);
      console.log(`[Torrent] Metadata ready! Found ${torrent.files.length} files in "${torrent.name}"`);

      // Keep peer discovery alive without downloading files in the background.
      if (torrent.pieces?.length) {
        try { torrent.deselect(0, torrent.pieces.length - 1, false); } catch (_) {}
      }

      entry.statsInterval = setInterval(() => {
        if (!entry.torrent || entry.torrent.destroyed) {
          clearInterval(entry.statsInterval);
          entry.statsInterval = null;
          return;
        }
        const speedMB = (entry.torrent.downloadSpeed / (1024 * 1024)).toFixed(2);
        const progress = (entry.torrent.progress * 100).toFixed(1);
        console.log(`[Swarm] "${String(entry.torrent.name).slice(0, 25)}" | Peers: ${entry.torrent.numPeers} | Speed: ${speedMB} MB/s | Downloaded: ${progress}% | Active streams: ${entry.openStreams.size} | Curated: ${entry.isCurated}`);
      }, 10000);
      entry.statsInterval.unref?.();
      resolve(torrent);
    });
  });

  activeTorrents.set(key, entry);
  entry.lastUsedAt = Date.now();
  return entry.promise;
}

// Torrent sessions are created only on explicit user selection; no startup warmup.\n\n// General file-based range streaming
function pipeFileToResponse(key, file, req, res) {
  if (!file) {
    if (!res.headersSent) res.status(404).send('No playable video file found in this torrent');
    return;
  }

  const entry = activeTorrents.get(key);
  if (entry) entry.lastUsedAt = Date.now();
  const ext = String(file.name || '').toLowerCase().split('.').pop();
  const contentType = ext === 'webm' ? 'video/webm' : ext === 'mkv' ? 'video/x-matroska' : 'video/mp4';
  const range = req.headers.range;
  let start = 0;
  let end = file.length - 1;
  let statusCode = 200;

  // Browsers use byte ranges for seeking and often probe with suffix ranges.
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2])) {
      res.setHeader('Content-Range', `bytes */${file.length}`);
      return res.status(416).end();
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        res.setHeader('Content-Range', `bytes */${file.length}`);
        return res.status(416).end();
      }
      start = Math.max(0, file.length - suffixLength);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Number(match[2]);
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) ||
        start < 0 || start >= file.length || end < start) {
      res.setHeader('Content-Range', `bytes */${file.length}`);
      return res.status(416).end();
    }
    end = Math.min(end, file.length - 1);
    statusCode = 206;
  }

  const headers = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Cache-Control': 'no-store'
  };
  if (statusCode === 206) headers['Content-Range'] = `bytes ${start}-${end}/${file.length}`;
  res.writeHead(statusCode, headers);

  // Explicitly select the requested file so WebTorrent prioritizes the pieces
  // needed by this stream. Metadata discovery alone leaves every piece deselected.
  if (entry?.pauseTimers?.has(file)) {
    clearTimeout(entry.pauseTimers.get(file));
    entry.pauseTimers.delete(file);
  }
  try { file.select(10); } catch (err) {
    console.warn(`[Stream] Could not prioritize ${file.name}: ${err.message}`);
  }

  const stream = file.createReadStream({ start, end });
  if (entry) {
    entry.openStreams.add(stream);
    entry.streamFiles.set(stream, file);
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;

    if (entry) {
      const wasTracked = entry.openStreams.delete(stream);
      entry.streamFiles.delete(stream);
      entry.lastUsedAt = Date.now();
      // Only deselect this file when no other HTTP range/stream is using it.
      const stillInUse = [...entry.streamFiles.values()].some(activeFile => activeFile === file);
      if (wasTracked && !stillInUse) {
        // Browsers often issue a sequence of short range requests while playing.
        // A short grace period prevents deselect/reselect churn between ranges.
        const oldTimer = entry.pauseTimers.get(file);
        if (oldTimer) clearTimeout(oldTimer);
        const timer = setTimeout(() => {
          entry.pauseTimers.delete(file);
          const inUse = [...entry.streamFiles.values()].some(activeFile => activeFile === file);
          if (!inUse) {
            try { file.deselect(); } catch (_) {}
            console.log(`[Bandwidth] Paused file after idle grace period: ${file.name}`);
          }
        }, 15000);
        timer.unref?.();
        entry.pauseTimers.set(file, timer);
      }
    }
    if (!stream.destroyed) {
      try { stream.destroy(); } catch (_) {}
    }
  };

  stream.on('error', (err) => {
    const msg = err?.message || '';
    if (err.code !== 'ERR_STREAM_PREMATURE_CLOSE' &&
        !msg.includes('Writable stream closed') &&
        !msg.includes('Torrent is removed')) {
      console.error('[Stream Read Error]', msg);
    }
    if (!res.destroyed && !res.writableEnded) {
      if (!res.headersSent) res.status(500).end('Unable to read video stream');
      else res.destroy(err);
    }
    cleanup();
  });

  // IMPORTANT: do not use req.close here. For normal GET requests, IncomingMessage
  // can close after the request has been received, before the response finishes.
  // Listening to it was destroying the media stream prematurely and causing stalls.
  stream.once('close', cleanup);
  res.once('close', cleanup);
  res.once('finish', cleanup);
  stream.pipe(res);
}

// ============================================================================
// 5. EXPRESS API ROUTES
// ============================================================================
app.get('/api/embed-config', (_req, res) => {
  const config = getEmbedProviderConfig();
  res.json({ enabled: Boolean(config), providerName: config?.name || null });
});

app.post('/api/external-player', (req, res) => {
  const config = getEmbedProviderConfig();
  if (!config) {
    return res.status(503).json({ error: 'External playback is not configured. Check the provider HTTPS origin and URL templates.' });
  }

  const mediaType = req.body?.mediaType === 'tv' ? 'tv' : req.body?.mediaType === 'movie' ? 'movie' : null;
  const id = String(req.body?.id || '').trim();
  if (!mediaType || !/^[A-Za-z0-9._:-]{1,80}$/.test(id)) {
    return res.status(400).json({ error: 'Provide a valid IMDb/TMDB-style ID and choose movie or TV.' });
  }

  let season = null;
  let episode = null;
  if (mediaType === 'tv') {
    season = Number(req.body?.season);
    episode = Number(req.body?.episode);
    if (!Number.isInteger(season) || season < 0 || season > 99 || !Number.isInteger(episode) || episode < 1 || episode > 999) {
      return res.status(400).json({ error: 'TV playback requires a valid season (0–99) and episode (1–999).' });
    }
  }

  const template = mediaType === 'movie' ? config.moviePath : config.tvPath;
  const path = template
    .replaceAll('{id}', encodeURIComponent(id))
    .replaceAll('{season}', encodeURIComponent(String(season ?? '')))
    .replaceAll('{episode}', encodeURIComponent(String(episode ?? '')));
  try {
    const url = new URL(path, config.base);
    if (url.origin !== config.base.origin || url.protocol !== 'https:') {
      return res.status(500).json({ error: 'Configured embed path must remain on the configured HTTPS provider origin.' });
    }
    res.json({ url: url.toString(), providerName: config.name, mediaType });
  } catch (_) {
    res.status(500).json({ error: 'The configured provider path is invalid.' });
  }
});

app.get('/api/title-search', async (req, res) => {
  const query = String(req.query.q || '').trim();
  if (query.length < 2) return res.status(400).json({ error: 'Enter at least two characters to search.' });
  if (query.length > 120) return res.status(400).json({ error: 'Search query is too long.' });
  if (!TMDB_API_READ_ACCESS_TOKEN) {
    return res.status(503).json({ error: 'TMDB search is not configured. Set TMDB_API_READ_ACCESS_TOKEN on the server and restart it.' });
  }

  // Search movies and TV shows concurrently so the user never needs to choose a type first.
  try {
    const searchOne = async mediaType => {
      const url = new URL(`https://api.themoviedb.org/3/search/${mediaType}`);
      url.searchParams.set('query', query);
      url.searchParams.set('include_adult', 'false');
      url.searchParams.set('language', 'en-US');
      url.searchParams.set('page', '1');
      const response = await fetchWithLogarithmicBackoff(url, {
        headers: { Authorization: `Bearer ${TMDB_API_READ_ACCESS_TOKEN}`, accept: 'application/json' },
        timeoutMs: 10000
      }, `TMDB ${mediaType} search`);
      if (!response.ok) throw new Error(`TMDB ${mediaType} search failed: HTTP ${response.status}`);
      const data = await response.json();
      const rawResults = Array.isArray(data.results) ? data.results : [];
      // Exclude movies with a release date after today. TV shows are unaffected.
      const today = new Date().toISOString().slice(0, 10);
      const eligibleResults = mediaType === 'movie'
        ? rawResults.filter(item => !item.release_date || item.release_date <= today)
        : rawResults;
      return eligibleResults.slice(0, 10).map(item => ({
        tmdbId: String(item.id),
        mediaType,
        title: String(mediaType === 'movie' ? (item.title || item.original_title || 'Untitled') : (item.name || item.original_name || 'Untitled')),
        year: String((mediaType === 'movie' ? item.release_date : item.first_air_date) || '').slice(0, 4),
        overview: String(item.overview || ''),
        posterUrl: item.poster_path ? `https://image.tmdb.org/t/p/w185${item.poster_path}` : null,
        popularity: Number(item.popularity || 0)
      }));
    };

    const [movies, shows] = await Promise.all([searchOne('movie'), searchOne('tv')]);
    const results = [...movies, ...shows]
      .sort((a, b) => b.popularity - a.popularity)
      .slice(0, 16)
      .map(({ popularity, ...item }) => item);
    res.json({ results });
  } catch (error) {
    console.error('TMDB title search error:', error.message);
    res.status(502).json({ error: 'Could not search both movies and TV shows on TMDB. Try again in a moment.' });
  }
});


// Fetch the season list for a TMDB TV series.
app.get('/api/tv/:id/seasons', async (req, res) => {
  if (!TMDB_API_READ_ACCESS_TOKEN) return res.status(503).json({ error: 'TMDB is not configured.' });
  const id = String(req.params.id || '');
  if (!/^\\d{1,12}$/.test(id)) return res.status(400).json({ error: 'Invalid TMDB TV ID.' });
  try {
    const response = await fetchWithLogarithmicBackoff(`https://api.themoviedb.org/3/tv/${id}?language=en-US`, {
      headers: { Authorization: `Bearer ${TMDB_API_READ_ACCESS_TOKEN}`, accept: 'application/json' },
      timeoutMs: 10000
    }, 'TMDB TV seasons');
    if (!response.ok) throw new Error(`TMDB returned HTTP ${response.status}`);
    const data = await response.json();
    res.json({
      seasons: (Array.isArray(data.seasons) ? data.seasons : []).map(season => ({
        seasonNumber: Number(season.season_number),
        name: String(season.name || `Season ${season.season_number}`),
        episodeCount: Number(season.episode_count || 0)
      }))
    });
  } catch (error) {
    console.error('TMDB season list error:', error.message);
    res.status(502).json({ error: 'Could not load seasons from TMDB. Please try again.' });
  }
});

// Fetch named episodes for one season of a TMDB TV series.
app.get('/api/tv/:id/seasons/:seasonNumber/episodes', async (req, res) => {
  if (!TMDB_API_READ_ACCESS_TOKEN) return res.status(503).json({ error: 'TMDB is not configured.' });
  const id = String(req.params.id || '');
  const seasonNumber = Number(req.params.seasonNumber);
  if (!/^\\d{1,12}$/.test(id) || !Number.isInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 99) {
    return res.status(400).json({ error: 'Invalid TV series or season number.' });
  }
  try {
    const response = await fetchWithLogarithmicBackoff(`https://api.themoviedb.org/3/tv/${id}/season/${seasonNumber}?language=en-US`, {
      headers: { Authorization: `Bearer ${TMDB_API_READ_ACCESS_TOKEN}`, accept: 'application/json' },
      timeoutMs: 10000
    }, 'TMDB TV episodes');
    if (!response.ok) throw new Error(`TMDB returned HTTP ${response.status}`);
    const data = await response.json();
    res.json({
      episodes: (Array.isArray(data.episodes) ? data.episodes : []).map(episode => ({
        episodeNumber: Number(episode.episode_number),
        name: String(episode.name || 'Untitled episode'),
        overview: String(episode.overview || '')
      }))
    });
  } catch (error) {
    console.error('TMDB episode list error:', error.message);
    res.status(502).json({ error: 'Could not load episode names from TMDB. Please try again.' });
  }
});

app.get('/api/library', (req, res) => {
  const query = req.query.q ? req.query.q.toLowerCase() : '';
  const filtered = CATALOG.filter(item =>
    item.title.toLowerCase().includes(query)
  );
  res.json(filtered);
});

app.get('/api/torrent-search', async (req, res) => {
  const query = (req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Search query is required' });
  const requestedLimit = Math.max(1, Math.min(50, Number.parseInt(req.query.limit, 10) || 50));

  console.log(`\n[Search] Querying indexers for: "${query}" (YTS limit ${requestedLimit})...`);
  const candidates = await searchTorrentIndexers(query, requestedLimit);
  const { best, results } = refineAndRankTorrents(candidates, query);

  res.json({ best, results });
});

// NEW ENDPOINT: Inspect torrent and return file-system view of all video files
app.get('/api/torrent-files', async (req, res) => {
  const source = req.query.source;
  if (!source) return res.status(400).json({ error: 'Missing torrent source' });

  try {
    const resolved = resolveTorrentSource(source);
    const torrent = await getReadyTorrent(resolved.key, resolved.source, resolved.isCurated);
    
    // Filter out video files
    const videoFiles = [];
    torrent.files.forEach((file, index) => {
      const lower = file.name.toLowerCase();
      if ((lower.endsWith('.mp4') || lower.endsWith('.mkv') || lower.endsWith('.webm')) && !lower.includes('sample')) {
        videoFiles.push({
          index,
          name: file.name,
          path: file.path,
          sizeMB: Math.round(file.length / (1024 * 1024))
        });
      }
    });

    res.json({
      torrentName: torrent.name,
      files: videoFiles
    });
  } catch (err) {
    console.error('Failed to load torrent files:', err.message);
    res.status(500).json({ error: 'Failed to retrieve torrent file list' });
  }
});

// Stream a specific curated media item
app.get('/api/stream/:id', async (req, res) => {
  const media = CATALOG.find(item => item.id === req.params.id);
  if (!media) return res.status(404).send('Media item not found');

  try {
    const torrent = await getReadyTorrent(media.id, media.magnet, true);
    const videoFiles = torrent.files.filter(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv') || f.name.endsWith('.webm'));
    const file = videoFiles.sort((a, b) => b.length - a.length)[0];
    pipeFileToResponse(media.id, file, req, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Failed to load torrent metadata');
  }
});

// Stream a specific file index from a dynamic torrent
app.get('/api/stream-file', async (req, res) => {
  const source = req.query.source;
  const fileIndex = parseInt(req.query.fileIndex, 10);

  if (!source || isNaN(fileIndex)) {
    return res.status(400).send('Missing source or fileIndex parameter');
  }

  try {
    const resolved = resolveTorrentSource(source);
    const torrent = await getReadyTorrent(resolved.key, resolved.source, resolved.isCurated);
    const file = torrent.files[fileIndex];
    if (!file) return res.status(404).send('File index not found in torrent');

    pipeFileToResponse(resolved.key, file, req, res);
  } catch (err) {
    if (!res.headersSent) res.status(500).send('Failed to stream selected file');
  }
});

app.post('/api/stop-stream', (req, res) => {
  // Closing the player destroys every torrent session so no swarm can continue
  // downloading in the background. A later play action creates a fresh session.
  for (const [key, entry] of [...activeTorrents.entries()]) {
    destroyTorrentEntry(key, entry);
  }
  console.log('[Player Closed] All streams and torrent sessions destroyed; background downloading stopped.');
  res.json({ stopped: true, torrentSessionsRetained: false });
});

// Reap idle dynamic sessions periodically, without affecting active playback.
const dynamicCleanupInterval = setInterval(stopDynamicTorrents, 60 * 1000);
dynamicCleanupInterval.unref?.();

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('[Torrent Lifecycle] Background warmup disabled; torrents start only after explicit selection.');
});

// Graceful shutdown: release all sockets and torrent stores when the server exits.
async function shutdown(signal) {
  console.log(`[Shutdown] ${signal} received; closing torrent sessions...`);
  for (const [key, entry] of activeTorrents.entries()) destroyTorrentEntry(key, entry);
  try { await client.destroy(); } catch (_) {}
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
