package com.mysteryvault.kotlin

import android.content.Context
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
    private val api = ApiService()
    private val torrentEngine = TorrentEngine(context)
    @Volatile private var running = false
    private var socket: ServerSocket? = null

    fun start(): Int {
        torrentEngine.start()
        socket = ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"))
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
            req.path == "/api/title-search" && req.method == "GET" -> sendJson(client, 200, api.titleSearch(req.query["q"].orEmpty()))
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
        val output = client.getOutputStream()
        output.write(header.toByteArray(StandardCharsets.ISO_8859_1))
        output.write(bytes)
        output.flush()
    }

    companion object {
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
            client.getOutputStream().write(header.toString().toByteArray(StandardCharsets.ISO_8859_1))
            client.getOutputStream().flush()
        }
    }
}