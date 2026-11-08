package com.mysteryvault.kotlin

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.io.*
import java.net.*
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

private data class HttpRequest(
    val method: String,
    val path: String,
    val query: Map<String, String>,
    val headers: Map<String, String>,
    val body: String
)

class LocalHttpServer(private val context: Context) {
    private val executor = Executors.newCachedThreadPool()
    private val api = ApiService(context)
    private val torrentEngine = TorrentEngine(context)
    @Volatile private var running = false
    private var socket: ServerSocket? = null

    fun start(): Int {
        torrentEngine.start()
        socket = ServerSocket(18765, 32, InetAddress.getByName("127.0.0.1"))
        running = true
        executor.execute {
            while (running) {
                try {
                    val client = socket?.accept() ?: break
                    executor.execute { handle(client) }
                } catch (_: SocketException) {
                    if (running) throw RuntimeException("Local server socket closed unexpectedly")
                }
            }
        }
        return socket!!.localPort
    }

    fun stop() {
        running = false
        try { socket?.close() } catch (_: Throwable) {}
        torrentEngine.stopAll()
        executor.shutdownNow()
    }

    private fun handle(socket: Socket) {
        socket.use { client ->
            client.soTimeout = 60_000
            try {
                val request = readRequest(client.getInputStream()) ?: return
                route(request, client)
            } catch (t: Throwable) {
                val message = t.message ?: "Internal server error"
                sendJson(client, 500, JSONObject().put("error", message))
            }
        }
    }

    private fun readRequest(input: InputStream): HttpRequest? {
        val raw = ByteArrayOutputStream()
        var previous = -1
        while (true) {
            val current = input.read()
            if (current == -1) return null
            raw.write(current)
            if (previous == '\r'.code && current == '\n'.code) {
                val bytes = raw.toByteArray()
                if (bytes.size >= 4 && bytes[bytes.size - 4].toInt() == '\r'.code &&
                    bytes[bytes.size - 3].toInt() == '\n'.code &&
                    bytes[bytes.size - 2].toInt() == '\r'.code &&
                    bytes[bytes.size - 1].toInt() == '\n'.code) break
            }
            previous = current
            if (raw.size() > 32 * 1024) throw IOException("Request headers too large")
        }
        val lines = raw.toString(StandardCharsets.ISO_8859_1.name()).split("\r\n")
        val first = lines.firstOrNull()?.split(" ") ?: throw IOException("Malformed request line")
        if (first.size < 2) throw IOException("Malformed request line")
        val uri = URI(first[1])
        val headers = mutableMapOf<String, String>()
        for (i in 1 until lines.size) {
            val index = lines[i].indexOf(':')
            if (index > 0) headers[lines[i].substring(0, index).trim().lowercase()] = lines[i].substring(index + 1).trim()
        }
        val length = headers["content-length"]?.toIntOrNull() ?: 0
        val body = if (length > 0) {
            val bytes = ByteArray(length)
            var offset = 0
            while (offset < length) {
                val read = input.read(bytes, offset, length - offset)
                if (read < 0) throw EOFException("Unexpected end of request body")
                offset += read
            }
            String(bytes, StandardCharsets.UTF_8)
        } else ""
        return HttpRequest(first[0], uri.path.ifEmpty { "/" }, parseQuery(uri.rawQuery), headers, body)
    }

    private fun parseQuery(raw: String?): Map<String, String> =
        raw.orEmpty().split("&").filter { it.isNotEmpty() }.associate {
            val p = it.split("=", limit = 2)
            URLDecoder.decode(p[0], "UTF-8") to URLDecoder.decode(p.getOrElse(1) { "" }, "UTF-8")
        }

    private fun route(req: HttpRequest, client: Socket) {
        when {
            req.path == "/" && req.method == "GET" -> serveAsset(client, "public/index.html")
            req.path == "/api/library" && req.method == "GET" -> sendText(client, 200, "application/json; charset=utf-8", api.library().getJSONArray("items").toString())
            req.path == "/api/embed-config" && req.method == "GET" -> sendJson(client, 200, api.embedConfig())
            req.path == "/api/custom-servers" && req.method == "GET" -> sendJson(client, 200, readCustomServers())
            req.path == "/api/custom-servers" && req.method == "POST" -> sendJson(client, 200, appendCustomServers(req.body))
            req.path == "/api/custom-servers" && req.method == "DELETE" -> sendJson(client, 200, deleteCustomServer(req.query["id"].orEmpty()))
            req.path == "/api/title-search" && req.method == "GET" -> sendJson(client, 200, api.titleSearch(req.query["q"].orEmpty()))
            req.path == "/api/discover" && req.method == "GET" -> sendJson(client, 200, api.discoverGenre(req.query["genreId"]?.toIntOrNull() ?: 0))
            req.path == "/api/trending" && req.method == "GET" -> sendJson(client, 200, api.trending())
            req.path == "/api/recommendations" && req.method == "GET" -> sendJson(client, 200, api.recommendations(req.query["mediaType"].orEmpty(), req.query["id"].orEmpty()))
            req.path.matches(Regex("/api/tmdb-poster/\\d{1,12}")) && req.method == "GET" -> {
                val id = req.path.substringAfterLast("/")
                val poster = api.cachedPoster(id)
                if (poster != null) sendBytes(client, 200, "image/jpeg", poster.readBytes())
                else sendText(client, 404, "text/plain; charset=utf-8", "Poster not cached")
            }
            req.path.matches(Regex("/api/tv/\\d{1,12}/seasons")) && req.method == "GET" -> {
                val id = req.path.substringAfter("/api/tv/").substringBefore("/seasons")
                sendJson(client, 200, api.seasons(id))
            }
            req.path.matches(Regex("/api/tv/\\d{1,12}/seasons/\\d{1,2}/episodes")) && req.method == "GET" -> {
                val parts = req.path.split("/")
                sendJson(client, 200, api.episodes(parts[3], parts[5]))
            }
            req.path == "/api/torrent-search" && req.method == "GET" ->
                sendJson(client, 200, torrentEngine.search(req.query["q"].orEmpty(), req.query["limit"]?.toIntOrNull() ?: 50))
            req.path == "/api/torrent-files" && req.method == "GET" ->
                sendJson(client, 200, torrentEngine.files(req.query["source"].orEmpty()))
            req.path == "/api/stream-file" && req.method == "GET" ->
                torrentEngine.stream(client, req.query["source"].orEmpty(), req.query["fileIndex"]?.toIntOrNull() ?: -1, req.headers["range"])
            req.path == "/api/download-file" && req.method == "GET" ->
                torrentEngine.download(client, req.query["source"].orEmpty(), req.query["fileIndex"]?.toIntOrNull() ?: -1)
            req.path == "/api/stream/sintel-sample" && req.method == "GET" ->
                torrentEngine.stream(client, TorrentEngine.SINTEL_MAGNET, 0, req.headers["range"])
            req.path == "/api/stop-stream" && req.method == "POST" -> {
                // TorrentEngine serializes shutdown behind any active stream
                // request, preventing libtorrent handles from being removed
                // while a native read/write is in progress.
                torrentEngine.stopAll()
                sendJson(client, 200, JSONObject().put("stopped", true).put("torrentSessionsRetained", false))
            }
            req.path == "/api/external-player" && req.method == "POST" ->
                sendJson(client, 200, api.externalPlayer(req.body))
            else -> serveAssetOr404(client, req.path)
        }
    }

    // App-private persistent storage: packaged assets are read-only.
    private val customServersFile: File
        get() = File(context.filesDir, "external-servers.json")

    private fun readCustomServers(): JSONObject {
        val servers = try {
            if (customServersFile.exists()) org.json.JSONArray(customServersFile.readText(StandardCharsets.UTF_8))
            else org.json.JSONArray()
        } catch (_: Throwable) { org.json.JSONArray() }
        return JSONObject().put("servers", servers)
    }

    private fun appendCustomServers(body: String): JSONObject {
        val incoming = JSONObject(body).optJSONArray("servers")
            ?: throw IllegalArgumentException("Missing servers array")
        val merged = linkedMapOf<String, JSONObject>()
        val existing = readCustomServers().optJSONArray("servers") ?: org.json.JSONArray()
        for (i in 0 until existing.length()) {
            val item = existing.optJSONObject(i) ?: continue
            val id = item.optString("id")
            if (id.isNotBlank()) merged[id] = item
        }
        for (i in 0 until incoming.length()) {
            val item = incoming.optJSONObject(i) ?: continue
            val id = item.optString("id").lowercase()
            val name = item.optString("name").trim()
            val movie = item.optString("urlTemplate").trim()
            val tv = item.optString("tvUrlTemplate").trim()
            if (!id.matches(Regex("[a-z0-9_-]{1,48}")) || name.isBlank() ||
                !movie.startsWith("https://", true) || !tv.startsWith("https://", true)) continue
            merged[id] = JSONObject().put("id", id).put("name", name)
                .put("urlTemplate", movie).put("tvUrlTemplate", tv)
                .put("custom", true).put("source", "csv")
        }
        val result = org.json.JSONArray()
        merged.values.forEach { result.put(it) }
        persistCustomServers(result)
        return JSONObject().put("servers", result)
    }

    private fun deleteCustomServer(id: String): JSONObject {
        if (id.isBlank()) throw IllegalArgumentException("Missing server id")
        val current = readCustomServers().optJSONArray("servers") ?: org.json.JSONArray()
        val result = org.json.JSONArray()
        var deleted = false
        for (i in 0 until current.length()) {
            val item = current.optJSONObject(i) ?: continue
            if (item.optString("id") == id) deleted = true else result.put(item)
        }
        if (!deleted) throw IllegalArgumentException("Custom server not found")
        persistCustomServers(result)
        return JSONObject().put("servers", result).put("deleted", id)
    }

    private fun persistCustomServers(servers: org.json.JSONArray) {
        val temporary = File(context.filesDir, "external-servers.json.tmp")
        temporary.writeText(servers.toString(2), StandardCharsets.UTF_8)
        if (customServersFile.exists() && !customServersFile.delete()) {
            throw IOException("Could not replace the server configuration file")
        }
        if (!temporary.renameTo(customServersFile)) {
            temporary.delete()
            throw IOException("Could not save the server configuration file")
        }
    }

    private fun serveAssetOr404(client: Socket, path: String) {
        // The browser sees the frontend at /, so its absolute asset URLs are
        // /css/... and /js/.... Those files are packaged under assets/public/.
        // Translate the web paths to the packaged asset paths before serving.
        val normalized = path.removePrefix("/").replace("..", "")
        val assetPath = when {
            normalized == "css" || normalized.startsWith("css/") -> "public/$normalized"
            normalized == "js" || normalized.startsWith("js/") -> "public/$normalized"
            normalized == "index.html" -> "public/index.html"
            normalized.startsWith("public/") -> normalized
            else -> "public/$normalized"
        }
        serveAsset(client, assetPath)
    }

    private fun serveAsset(client: Socket, assetPath: String) {
        try {
            val data = context.assets.open(assetPath).use { it.readBytes() }
            val mime = when {
                assetPath.endsWith(".html") -> "text/html; charset=utf-8"
                assetPath.endsWith(".js") -> "application/javascript; charset=utf-8"
                assetPath.endsWith(".css") -> "text/css; charset=utf-8"
                assetPath.endsWith(".svg") -> "image/svg+xml"
                assetPath.endsWith(".png") -> "image/png"
                else -> "application/octet-stream"
            }
            sendBytes(client, 200, mime, data)
        } catch (_: Throwable) {
            sendText(client, 404, "text/plain; charset=utf-8", "Not found")
        }
    }

    private fun sendJson(client: Socket, status: Int, json: JSONObject) =
        sendText(client, status, "application/json; charset=utf-8", json.toString())

    private fun sendText(client: Socket, status: Int, contentType: String, text: String) =
        sendBytes(client, status, contentType, text.toByteArray(StandardCharsets.UTF_8))

    private fun sendBytes(client: Socket, status: Int, contentType: String, bytes: ByteArray) {
        val reason = when (status) {
            200 -> "OK"; 206 -> "Partial Content"; 400 -> "Bad Request"; 404 -> "Not Found"
            416 -> "Range Not Satisfiable"; 500 -> "Internal Server Error"; 502 -> "Bad Gateway"; else -> "Error"
        }
        val header = "HTTP/1.1 $status $reason\r\nContent-Type: $contentType\r\nContent-Length: ${bytes.size}\r\nCache-Control: no-store\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\n\r\n"
        try {
            val output = client.getOutputStream()
            output.write(header.toByteArray(StandardCharsets.ISO_8859_1))
            output.write(bytes)
            output.flush()
        } catch (_: SocketException) {
            // WebView/media clients routinely cancel outstanding requests while
            // seeking, replacing a source, or closing the player. A broken pipe
            // is a disconnected HTTP client, not an application-fatal failure.
            Log.d(TAG, "HTTP client disconnected before response completed")
        } catch (e: IOException) {
            // Treat other response-write failures as request-local as well.
            // In particular, never let an executor worker die from a socket I/O
            // exception and take down the Android process.
            Log.w(TAG, "Unable to write HTTP response: ${e.message}")
        }
    }

    companion object {
        private const val TAG = "LocalHttpServer"

        fun sendDownloadHeaders(client: Socket, contentType: String, length: Long, fileName: String) {
            val safeName = fileName.replace("\"", "_").replace("\\r", "_").replace("\\n", "_")
            val header = StringBuilder("HTTP/1.1 200 OK\r\n")
                .append("Content-Type: $contentType\r\n")
                .append("Content-Length: $length\r\n")
                .append("Content-Disposition: attachment; filename=\"${safeName}\"\r\n")
                .append("Cache-Control: no-store\r\n")
                .append("Connection: close\r\n\r\n")
            try {
                val output = client.getOutputStream()
                output.write(header.toString().toByteArray(StandardCharsets.ISO_8859_1))
                output.flush()
            } catch (_: SocketException) {
                Log.d(TAG, "Download client disconnected before headers completed")
            } catch (e: IOException) {
                Log.w(TAG, "Unable to write download headers: ${e.message}")
            }
        }

        fun sendStreamHeaders(client: Socket, status: Int, contentType: String, length: Long, range: String?) {
            val reason = if (status == 206) "Partial Content" else "OK"
            val header = StringBuilder("HTTP/1.1 $status $reason\r\n")
                .append("Content-Type: $contentType\r\n")
                .append("Accept-Ranges: bytes\r\n")
                .append("Content-Length: $length\r\n")
                .append("Cache-Control: no-store\r\n")
                .append("Connection: close\r\n")
            if (range != null) header.append("Content-Range: $range\r\n")
            header.append("\r\n")
            try {
                val output = client.getOutputStream()
                output.write(header.toString().toByteArray(StandardCharsets.ISO_8859_1))
                output.flush()
            } catch (_: SocketException) {
                Log.d(TAG, "HTTP stream client disconnected before headers completed")
            } catch (e: IOException) {
                Log.w(TAG, "Unable to write HTTP stream headers: ${e.message}")
            }
        }
    }
}