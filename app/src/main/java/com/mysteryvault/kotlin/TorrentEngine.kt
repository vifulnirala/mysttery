package com.mysteryvault.kotlin

import android.content.Context
import com.frostwire.jlibtorrent.Priority
import com.frostwire.jlibtorrent.SessionManager
import com.frostwire.jlibtorrent.TorrentHandle
import com.frostwire.jlibtorrent.TorrentInfo
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap

class TorrentEngine(context: Context) {
    private val root = File(context.filesDir, "torrents").apply { mkdirs() }
    private val temp = File(context.cacheDir, "torrent-meta").apply { mkdirs() }
    private val session = SessionManager(false)
    private val active = ConcurrentHashMap<String, ActiveTorrent>()

    fun start() {
        if (!session.isRunning) session.start()
    }

    fun stopAll() {
        for ((_, torrent) in active) {
            try { session.remove(torrent.handle) } catch (_: Throwable) {}
        }
        active.clear()
    }

    fun search(query: String, limit: Int): JSONObject {
        require(query.isNotBlank()) { "Search query is required" }
        val trimmed = query.trim()
        if (trimmed.startsWith("magnet:?") || trimmed.matches(Regex("[A-Fa-f0-9]{40}"))) {
            val source = if (trimmed.startsWith("magnet:?")) trimmed else "magnet:?xt=urn:btih:" + trimmed
            val result = JSONObject()
                .put("title", "Direct Magnet Stream (" + trimmed.take(24) + "...)")
                .put("year", "Direct").put("seeders", 100).put("sizeMB", 800)
                .put("poster", "https://via.placeholder.com/300x450?text=Direct+Magnet")
                .put("source", source).put("provider", "Direct magnet")
            return JSONObject().put("best", result).put("results", JSONArray().put(result))
        }
        val results = mutableListOf<JSONObject>()
        results += searchYts(trimmed, limit)
        results += searchArchive(trimmed)
        val ranked = results.map { item ->
            item.put("score", score(item, trimmed))
            item
        }.filter { it.optInt("score") > 0 }
            .sortedWith(compareByDescending<JSONObject> { if (it.optString("provider") == "YTS") 1 else 0 }
                .thenByDescending { it.optInt("score") })
        val out = JSONArray()
        ranked.forEach { out.put(it) }
        return JSONObject().put("best", ranked.firstOrNull() ?: JSONObject.NULL).put("results", out)
    }

    private fun searchYts(query: String, limit: Int): List<JSONObject> {
        return try {
        val url = URL(
            BuildConfig.YTS_API_BASE + "?query_term=" + URLEncoder.encode(query, "UTF-8") +
                "&limit=" + limit.coerceIn(1, 50) + "&sort_by=seeds&order_by=desc"
        )
        val data = getJson(url)
        if (data.optString("status") != "ok") return emptyList()
        val movies = data.optJSONObject("data")?.optJSONArray("movies") ?: return emptyList()
        val trackers = listOf(
            "udp://tracker.opentrackr.org:1337/announce",
            "udp://open.stealth.si:80/announce",
            "udp://tracker.torrent.eu.org:451/announce",
            "udp://tracker.openbittorrent.com:6969/announce"
        )
        val out = mutableListOf<JSONObject>()
        for (i in 0 until movies.length()) {
            val movie = movies.getJSONObject(i)
            val torrents = movie.optJSONArray("torrents") ?: continue
            for (j in 0 until torrents.length()) {
                val t = torrents.getJSONObject(j)
                val hash = t.optString("hash").trim()
                if (!hash.matches(Regex("[A-Fa-f0-9]{40}"))) continue
                val release = movie.optString("title", "YTS movie") + " (" +
                    movie.optInt("year", 0) + ") " + t.optString("quality") + " " + t.optString("type")
                val magnet = "magnet:?xt=urn:btih:" + hash + "&dn=" +
                    URLEncoder.encode(release.trim(), "UTF-8") +
                    trackers.joinToString("") { "&tr=" + URLEncoder.encode(it, "UTF-8") }
                val rawSize = t.optLong("size_bytes", 0)
                val size = if (rawSize > 0) (rawSize / 1048576).toInt() else parseSize(t.optString("size"))
                out += JSONObject().put("title", release.trim()).put("year", movie.optString("year"))
                    .put("seeders", t.optInt("seeds")).put("sizeMB", size.coerceAtLeast(800))
                    .put("poster", movie.optString("medium_cover_image", movie.optString("large_cover_image")))
                    .put("source", magnet).put("provider", "YTS").put("movieId", movie.optInt("id"))
                    .put("quality", t.optString("quality")).put("torrentType", t.optString("type"))
                    .put("rating", t.optDouble("rating", 0.0))
            }
        }
        out
        } catch (_: Throwable) { emptyList() }
    }

    private fun searchArchive(query: String): List<JSONObject> {
        return try {
        val tokens = tokenize(query)
        if (tokens.isEmpty()) return emptyList()
        val clause = tokens.joinToString(" AND ") { "\"" + it + "\"" }
        val iaQuery = "title:(" + clause + ") AND mediatype:(movies) AND -title:(commercial OR promo OR trailer OR podcast OR opening)"
        val url = URL(
            "https://archive.org/advancedsearch.php?q=" + URLEncoder.encode(iaQuery, "UTF-8") +
                "&fl[]=identifier,title,year,downloads,item_size&sort[]=downloads+desc&rows=15&page=1&output=json"
        )
        val data = getJson(url)
        val docs = data.optJSONObject("response")?.optJSONArray("docs") ?: return emptyList()
        val out = mutableListOf<JSONObject>()
        for (i in 0 until docs.length()) {
            val d = docs.getJSONObject(i)
            val size = (d.optLong("item_size", 0) / 1048576).toInt()
            if (size < 50) continue
            val id = d.optString("identifier")
            out += JSONObject()
                .put("title", d.optString("title") + " (" + d.optString("year", "Classic") + ") [MP4 x264]")
                .put("year", d.optString("year", "Archive"))
                .put("seeders", d.optInt("downloads", 10))
                .put("sizeMB", size)
                .put("poster", "https://archive.org/services/img/" + id)
                .put("source", "https://archive.org/download/" + id + "/" + id + "_archive.torrent")
                .put("provider", "Internet Archive")
        }
        out
        } catch (_: Throwable) { emptyList() }
    }

    fun files(source: String): JSONObject {
        require(source.isNotBlank()) { "Missing torrent source" }
        val torrent = ensureTorrent(source)
        val fs = torrent.info.files()
        val files = JSONArray()
        for (i in 0 until fs.numFiles()) {
            val name = fs.fileName(i)
            if (isVideo(name) && !name.lowercase().contains("sample")) {
                files.put(
                    JSONObject().put("index", i).put("name", name).put("path", name)
                        .put("sizeMB", fs.fileSize(i) / 1048576)
                )
            }
        }
        return JSONObject().put("torrentName", torrent.info.name()).put("files", files)
    }

    fun stream(client: java.net.Socket, source: String, fileIndex: Int, rangeHeader: String?) {
        require(source.isNotBlank() && fileIndex >= 0) { "Missing source or fileIndex parameter" }
        val torrent = ensureTorrent(source)
        val fs = torrent.info.files()
        require(fileIndex < fs.numFiles()) { "File index not found in torrent" }
        val fileSize = fs.fileSize(fileIndex)
        val range = parseRange(rangeHeader, fileSize)
        val start = range.first
        val end = range.second
        val file = File(fs.filePath(fileIndex, torrent.handle.savePath()))
        val pieceLength = fs.pieceLength().toLong()
        val firstPiece = ((fs.fileOffset(fileIndex) + start) / pieceLength).toInt()
        val lastPiece = ((fs.fileOffset(fileIndex) + end) / pieceLength).toInt()

        torrent.handle.filePriority(fileIndex, Priority.NORMAL)
        for (piece in firstPiece..lastPiece) {
            torrent.handle.setPieceDeadline(piece, 30_000)
        }

        val deadline = System.currentTimeMillis() + 60_000
        for (piece in firstPiece..lastPiece) {
            while (!torrent.handle.havePiece(piece)) {
                if (System.currentTimeMillis() > deadline) throw IOException("Timed out waiting for torrent data")
                Thread.sleep(150)
            }
        }

        val contentType = when (file.extension.lowercase()) {
            "webm" -> "video/webm"
            "mkv" -> "video/x-matroska"
            else -> "video/mp4"
        }
        val partial = rangeHeader != null
        LocalHttpServer.sendStreamHeaders(
            client, if (partial) 206 else 200, contentType, end - start + 1,
            if (partial) "bytes " + start + "-" + end + "/" + fileSize else null
        )

        RandomAccessFile(file, "r").use { raf ->
            raf.seek(start)
            val output = client.getOutputStream()
            val buffer = ByteArray(256 * 1024)
            var remaining = end - start + 1
            while (remaining > 0) {
                val read = raf.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
                if (read <= 0) break
                output.write(buffer, 0, read)
                remaining -= read
            }
            output.flush()
        }
    }

    private fun ensureTorrent(source: String): ActiveTorrent {
        active[source]?.let { if (it.handle.isValid()) return it }
        stopAll()

        val metadata = if (source.startsWith("magnet:?", true)) {
            session.fetchMagnet(source, 45, temp) ?: throw IOException("Could not resolve torrent metadata")
        } else {
            downloadBytes(source)
        }

        val info = TorrentInfo.bdecode(metadata)
        val hash = info.infoHashV1()?.toHex() ?: info.infoHashV2()?.toHex() ?: System.currentTimeMillis().toString()
        val saveDir = File(root, hash).apply { mkdirs() }
        session.download(info, saveDir)

        var handle: TorrentHandle? = null
        repeat(100) {
            handle = session.find(info)
            if (handle?.isValid() == true) return@repeat
            Thread.sleep(100)
        }
        val result = handle ?: throw IOException("Torrent engine did not create a valid handle")
        val activeTorrent = ActiveTorrent(info, result, saveDir)
        active[source] = activeTorrent
        return activeTorrent
    }

    private fun downloadBytes(url: String): ByteArray {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 10_000
        c.readTimeout = 20_000
        return c.inputStream.use { it.readBytes() }
    }

    private fun getJson(url: URL): JSONObject {
        val c = url.openConnection() as HttpURLConnection
        c.connectTimeout = 10_000
        c.readTimeout = 15_000
        val code = c.responseCode
        if (code !in 200..299) throw IOException("HTTP " + code)
        return JSONObject(c.inputStream.bufferedReader().use { it.readText() })
    }

    private fun tokenize(text: String): List<String> =
        text.lowercase().replace(Regex("[^a-z0-9\\s]"), " ").split(Regex("\\s+"))
            .filter { it.length > 1 && it !in setOf("the", "and", "for", "with", "from") }

    private fun score(item: JSONObject, query: String): Int {
        val title = item.optString("title").lowercase()
        val q = tokenize(query)
        val words = title.split(Regex("\\s+"))
        val matched = q.count { it in words }
        if (q.isEmpty() || matched == 0) return -999
        var score = (matched.toDouble() / q.size * 120).toInt()
        if (title.startsWith(query.lowercase())) score += 100
        score += minOf(85, kotlin.math.log10((item.optInt("seeders", 0) + 1).toDouble()).times(28).toInt())
        if ("1080p" in title) score += 35
        if ("720p" in title) score += 40
        if ("2160p" in title || "4k" in title) score -= 50
        if (Regex("x265|hevc|10bit").containsMatchIn(title)) score -= 120
        if (Regex("dts|truehd|atmos").containsMatchIn(title)) score -= 45
        return score
    }

    private fun parseSize(value: String): Int {
        val match = Regex("([0-9.]+)\\s*(GB|MB|KB)", RegexOption.IGNORE_CASE).find(value) ?: return 0
        val amount = match.groupValues[1].toDouble()
        return when (match.groupValues[2].uppercase()) {
            "GB" -> (amount * 1024).toInt()
            "KB" -> (amount / 1024).toInt()
            else -> amount.toInt()
        }
    }

    private fun isVideo(name: String): Boolean =
        name.lowercase().endsWith(".mp4") || name.lowercase().endsWith(".mkv") || name.lowercase().endsWith(".webm")

    private fun parseRange(header: String?, size: Long): Pair<Long, Long> {
        if (header.isNullOrBlank()) return 0L to size - 1
        val match = Regex("bytes=(\\d*)-(\\d*)").matchEntire(header.trim()) ?: throw IllegalArgumentException("Invalid range")
        val start = match.groupValues[1].toLongOrNull()
        val end = match.groupValues[2].toLongOrNull()
        val result = if (start == null) {
            val suffix = end ?: throw IllegalArgumentException("Invalid range")
            maxOf(0L, size - suffix) to size - 1
        } else {
            start to minOf(end ?: size - 1, size - 1)
        }
        if (result.first < 0 || result.first >= size || result.second < result.first) {
            throw IllegalArgumentException("Invalid range")
        }
        return result
    }

    private data class ActiveTorrent(
        val info: TorrentInfo,
        val handle: TorrentHandle,
        val saveDir: File
    )

    companion object {
        const val SINTEL_MAGNET = "magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel&tr=udp%3A%2F%2Ftracker.opentrackr.org%3A1337&tr=wss%3A%2F%2Ftracker.openwebtorrent.com&ws=https%3A%2F%2Fwebtorrent.io%2Ftorrents%2Fsintel.torrent"
    }
}