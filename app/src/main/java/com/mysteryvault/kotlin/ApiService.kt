package com.mysteryvault.kotlin

import android.net.Uri
import android.content.Context
import java.io.File
import java.io.FileOutputStream
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate

class ApiService(private val context: Context) {
    private val posterDirectory = File(context.filesDir, "tmdb-posters").apply { mkdirs() }

    private fun cachePoster(id: String): Boolean {
        val cached = File(posterDirectory, "$id.jpg")
        if (cached.exists() && cached.length() > 0) return true
        return try {
            val token = BuildConfig.TMDB_TOKEN
            if (token.isBlank()) return false
            val details = getJson(
                "https://api.themoviedb.org/3/tv/$id?language=en-US",
                mapOf("Authorization" to "Bearer $token", "accept" to "application/json")
            )
            val posterPath = details.optString("poster_path").takeIf { it.isNotBlank() && it != "null" } ?: return false
            val imageUrl = URL("https://image.tmdb.org/t/p/w500$posterPath")
            val connection = imageUrl.openConnection() as HttpURLConnection
            connection.connectTimeout = 12_000
            connection.readTimeout = 15_000
            connection.instanceFollowRedirects = true
            val code = connection.responseCode
            if (code !in 200..299) { connection.disconnect(); return false }
            val temporary = File(posterDirectory, "$id.jpg.tmp")
            connection.inputStream.use { input -> FileOutputStream(temporary).use { output -> input.copyTo(output) } }
            connection.disconnect()
            if (temporary.length() <= 0) { temporary.delete(); return false }
            if (cached.exists()) cached.delete()
            temporary.renameTo(cached)
        } catch (_: Throwable) { false }
    }

    fun cachedPoster(id: String): File? {
        if (!id.matches(Regex("\\d{1,12}"))) return null
        return File(posterDirectory, "$id.jpg").takeIf { it.exists() && it.length() > 0 }
    }
    private fun getJson(url: String, headers: Map<String, String> = emptyMap(), timeout: Int = 10_000): JSONObject {
        var last: Throwable? = null
        repeat(4) { attempt ->
            try {
                val connection = URL(url).openConnection() as HttpURLConnection
                connection.connectTimeout = timeout
                connection.readTimeout = timeout
                headers.forEach { (key, value) -> connection.setRequestProperty(key, value) }
                val code = connection.responseCode
                val stream = if (code in 200..299) connection.inputStream else connection.errorStream
                val text = stream?.bufferedReader()?.use { it.readText() }.orEmpty()
                connection.disconnect()
                if (code in 200..299) return JSONObject(text)
                if (code !in setOf(408, 425, 429, 500, 502, 503, 504)) throw IllegalStateException("HTTP $code")
                last = IllegalStateException("HTTP $code")
            } catch (t: Throwable) {
                last = t
            }
            if (attempt < 3) Thread.sleep(minOf(5_000L, (800 * kotlin.math.ln((attempt + 2).toDouble())).toLong()))
        }
        throw last ?: IllegalStateException("Request failed")
    }

    fun library(): JSONObject {
        val items = JSONArray()
        items.put(JSONObject().put("id", "sintel-sample").put("title", "Test Stream (Open-Source Sintel)")
            .put("type", "test").put("year", 2010)
            .put("poster", "https://images.metahub.space/poster/medium/tt1727587/img")
            .put("magnet", TorrentEngine.SINTEL_MAGNET))

        // Curated TMDB TV entries are included in the Android app's own API.
        // The web server has a separate catalogue, so keeping these here is
        // necessary for the standalone Kotlin build.
        val scoobyShows = listOf(
            Triple("926", "Scooby-Doo, Where Are You!", 1969),
            Triple("1068", "The New Scooby-Doo Movies", 1972),
            Triple("6005", "Scooby-Doo and Scrappy-Doo", 1979),
            Triple("64016", "The New Scooby-Doo Mysteries", 1984),
            Triple("1069", "The 13 Ghosts of Scooby-Doo", 1985),
            Triple("652", "What's New, Scooby-Doo?", 2002),
            Triple("593", "Shaggy & Scooby-Doo Get a Clue!", 2006),
            Triple("18123", "Scooby-Doo! Mystery Incorporated", 2010),
            Triple("64228", "Be Cool, Scooby-Doo!", 2015),
            Triple("88367", "Scooby-Doo and Guess Who?", 2019)
        )
        scoobyShows.forEach { (id, title, year) ->
            items.put(JSONObject()
                .put("id", "scooby-tv-$id")
                .put("title", title)
                .put("type", "tmdb")
                .put("mediaType", "tv")
                .put("tmdbId", id)
                .put("defaultServerId", "vidsrc")
                .put("year", year)
                .put("poster", JSONObject.NULL)
                .put("posterUrl", if (cachePoster(id)) "/api/tmdb-poster/$id" else JSONObject.NULL))
        }
        return JSONObject().put("items", items)
    }

    fun embedConfig(): JSONObject = JSONObject().put("enabled", true)
        .put("providerName", BuildConfig.EMBED_VIDCORE_NAME)
        .put("defaultProviderId", "vidcore")
        .put("providers", JSONArray().apply {
            put(JSONObject().put("id", "vidcore").put("name", BuildConfig.EMBED_VIDCORE_NAME))
            put(JSONObject().put("id", "vidsrc").put("name", BuildConfig.EMBED_VIDSRC_NAME))
        })

    fun externalPlayer(body: String): JSONObject {
        val input = JSONObject(body)
        val mediaType = input.optString("mediaType")
        val id = input.optString("id").trim()
        val serverId = input.optString("serverId").ifBlank { "vidcore" }
        val season = input.optInt("season", 1)
        val episode = input.optInt("episode", 1)
        require(mediaType == "movie" || mediaType == "tv") { "Choose movie or TV." }
        require(id.matches(Regex("[A-Za-z0-9._:-]{1,80}"))) { "Provide a valid IMDb/TMDB-style ID." }
        if (mediaType == "tv") require(season in 0..99 && episode in 1..999) { "Invalid TV season or episode." }

        val base: String
        val template: String
        val name: String
        if (serverId == "vidsrc") {
            base = BuildConfig.EMBED_VIDSRC_BASE_URL
            template = if (mediaType == "movie") BuildConfig.EMBED_VIDSRC_MOVIE_PATH else BuildConfig.EMBED_VIDSRC_TV_PATH
            name = BuildConfig.EMBED_VIDSRC_NAME
        } else {
            base = BuildConfig.EMBED_VIDCORE_BASE_URL
            template = if (mediaType == "movie") BuildConfig.EMBED_VIDCORE_MOVIE_PATH else BuildConfig.EMBED_VIDCORE_TV_PATH
            name = BuildConfig.EMBED_VIDCORE_NAME
        }
        val path = template.replace("{id}", Uri.encode(id))
            .replace("{season}", Uri.encode(season.toString()))
            .replace("{episode}", Uri.encode(episode.toString()))
        val url = URL(base.trimEnd('/') + "/" + path.trimStart('/'))
        require(url.protocol == "https") { "External player must use HTTPS." }
        return JSONObject().put("url", url.toString()).put("providerName", name)
            .put("providerId", serverId).put("mediaType", mediaType)
    }

    fun titleSearch(query: String): JSONObject {
        val q = query.trim()
        require(q.length in 2..120) { "Enter a title between 2 and 120 characters." }
        val token = BuildConfig.TMDB_TOKEN
        if (token.isBlank()) throw IllegalStateException("TMDB search is not configured in this Android build.")
        val movie = getJson(
            "https://api.themoviedb.org/3/search/movie?query=${Uri.encode(q)}&include_adult=false&language=en-US&page=1",
            mapOf("Authorization" to "Bearer $token", "accept" to "application/json")
        )
        val tv = getJson(
            "https://api.themoviedb.org/3/search/tv?query=${Uri.encode(q)}&include_adult=false&language=en-US&page=1",
            mapOf("Authorization" to "Bearer $token", "accept" to "application/json")
        )
        val results = mutableListOf<Pair<Double, JSONObject>>()
        val today = LocalDate.now().toString()
        fun add(source: JSONObject, mediaType: String) {
            val array = source.optJSONArray("results") ?: return
            for (i in 0 until minOf(array.length(), 10)) {
                val item = array.getJSONObject(i)
                val release = if (mediaType == "movie") item.optString("release_date") else item.optString("first_air_date")
                if (mediaType == "movie" && release.isNotBlank() && release > today) continue
                val title = if (mediaType == "movie") item.optString("title", item.optString("original_title", "Untitled"))
                else item.optString("name", item.optString("original_name", "Untitled"))
                val result = JSONObject()
                    .put("tmdbId", item.optString("id"))
                    .put("mediaType", mediaType)
                    .put("title", title)
                    .put("year", release.take(4))
                    .put("overview", item.optString("overview"))
                    .put("posterUrl", if (item.optString("poster_path").isNotBlank()) "https://image.tmdb.org/t/p/w185${item.optString("poster_path")}" else JSONObject.NULL)
                results += item.optDouble("popularity", 0.0) to result
            }
        }
        add(movie, "movie")
        add(tv, "tv")
        results.sortByDescending { it.first }
        val out = JSONArray()
        results.take(16).forEach { out.put(it.second) }
        return JSONObject().put("results", out)
    }

    fun seasons(id: String): JSONObject {
        val token = BuildConfig.TMDB_TOKEN
        if (token.isBlank()) throw IllegalStateException("TMDB is not configured.")
        require(id.matches(Regex("\\d{1,12}"))) { "Invalid TMDB TV ID." }
        val data = getJson(
            "https://api.themoviedb.org/3/tv/$id?language=en-US",
            mapOf("Authorization" to "Bearer $token", "accept" to "application/json")
        )
        val seasons = JSONArray()
        val source = data.optJSONArray("seasons") ?: JSONArray()
        for (i in 0 until source.length()) {
            val s = source.getJSONObject(i)
            seasons.put(JSONObject().put("seasonNumber", s.optInt("season_number"))
                .put("name", s.optString("name", "Season ${s.optInt("season_number")}"))
                .put("episodeCount", s.optInt("episode_count")))
        }
        return JSONObject().put("seasons", seasons)
    }

    fun episodes(id: String, season: String): JSONObject {
        val token = BuildConfig.TMDB_TOKEN
        if (token.isBlank()) throw IllegalStateException("TMDB is not configured.")
        require(id.matches(Regex("\\d{1,12}"))) { "Invalid TV series ID." }
        val seasonNumber = season.toIntOrNull() ?: throw IllegalArgumentException("Invalid season number.")
        require(seasonNumber in 0..99)
        val data = getJson(
            "https://api.themoviedb.org/3/tv/$id/season/$seasonNumber?language=en-US",
            mapOf("Authorization" to "Bearer $token", "accept" to "application/json")
        )
        val episodes = JSONArray()
        val source = data.optJSONArray("episodes") ?: JSONArray()
        for (i in 0 until source.length()) {
            val e = source.getJSONObject(i)
            episodes.put(JSONObject().put("episodeNumber", e.optInt("episode_number"))
                .put("name", e.optString("name", "Untitled episode"))
                .put("overview", e.optString("overview")))
        }
        return JSONObject().put("episodes", episodes)
    }
}