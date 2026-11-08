package com.mysteryvault.kotlin

import android.app.Activity
import android.content.ContentValues
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var server: LocalHttpServer? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    private val backCallback = android.window.OnBackInvokedCallback {
        if (fullscreenView != null) {
            exitFullscreen()
        } else {
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(6, 9, 20))
            setOnApplyWindowInsetsListener { view, insets ->
                val topInset = if (fullscreenView == null) {
                    if (Build.VERSION.SDK_INT >= 30) {
                        insets.getInsets(android.view.WindowInsets.Type.statusBars()).top
                    } else {
                        insets.systemWindowInsetTop
                    }
                } else 0
                view.setPadding(0, topInset, 0, 0)
                insets
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // Keep the app shell on its loopback origin. The embedded player
                    // remains free to load inside its iframe, but cannot navigate the
                    // whole app to an arbitrary ad/redirect landing page.
                    return request.isForMainFrame && request.url.host != "127.0.0.1"
                }

                override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                    val host = request.url.host?.lowercase(Locale.ROOT) ?: return null
                    if (isKnownAdvertisingHost(host)) {
                        return WebResourceResponse(
                            "text/plain", "UTF-8", 403, "Blocked",
                            mapOf("Cache-Control" to "no-store"),
                            ByteArrayInputStream(ByteArray(0))
                        )
                    }
                    return super.shouldInterceptRequest(view, request)
                }
            }
            webChromeClient = object : WebChromeClient() {
                override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message): Boolean {
                    // Do not create ad tabs or popup WebViews.
                    return false
                }

                override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                    if (fullscreenView != null) {
                        callback.onCustomViewHidden()
                        return
                    }
                    fullscreenView = view
                    fullscreenCallback = callback
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
                    window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN)
                    window.decorView.systemUiVisibility =
                        View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    val decor = window.decorView as FrameLayout
                    decor.addView(view, FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
                    ))
                    view.setBackgroundColor(Color.BLACK)
                    webView.setPadding(0, 0, 0, 0)
                }

                override fun onHideCustomView() { exitFullscreen() }
            }
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportZoom(false)
            addJavascriptInterface(DownloadBridge(), "Android")
        }
        setContentView(webView)

        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                backCallback
            )
        }

        Thread {
            try {
                val httpServer = LocalHttpServer(applicationContext)
                val port = httpServer.start()
                server = httpServer
                runOnUiThread { webView.loadUrl("http://127.0.0.1:$port/") }
            } catch (t: Throwable) {
                runOnUiThread { webView.loadData(
                    "<html><body><h2>Mystery Vault failed to start</h2><pre>" + t.message + "</pre></body></html>",
                    "text/html", "UTF-8"
                ) }
            }
        }.start()
    }

    private fun isKnownAdvertisingHost(host: String): Boolean {
        val blocked = listOf(
            "doubleclick.net", "googlesyndication.com", "googleadservices.com",
            "adservice.google.com", "adnxs.com", "popads.net", "popcash.net",
            "exoclick.com", "trafficjunky.com", "adsterra.com", "propellerads.com",
            "juicyads.com", "hilltopads.net", "bidvertiser.com", "taboola.com",
            "outbrain.com", " Monetag.com".trim().lowercase(Locale.ROOT)
        )
        return blocked.any { host == it || host.endsWith("." + it) }
    }

    private fun exitFullscreen() {
        val view = fullscreenView ?: return
        (view.parent as? FrameLayout)?.removeView(view)
        fullscreenView = null
        fullscreenCallback?.onCustomViewHidden()
        fullscreenCallback = null
        window.clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED
        webView.requestApplyInsets()
    }

    private inner class DownloadBridge {
        @JavascriptInterface
        fun downloadTorrent(url: String, requestedName: String) {
            try {
                val parsed = URL(url)
                if (parsed.protocol != "http" ||
                    parsed.host != "127.0.0.1" ||
                    parsed.path != "/api/download-file"
                ) throw IllegalArgumentException("Invalid download source")
            } catch (_: Throwable) {
                runOnUiThread {
                    Toast.makeText(this@MainActivity, "Download source rejected.", Toast.LENGTH_SHORT).show()
                }
                return
            }

            val safeName = requestedName
                .substringAfterLast('/')
                .substringAfterLast('\\')
                .replace(Regex("[^A-Za-z0-9._ -]"), "_")
                .take(180)
                .ifBlank { "video-file.mp4" }

            Thread { downloadToDevice(url, safeName) }.start()
        }
    }

    private fun downloadToDevice(url: String, fileName: String) {
        var outputUri: Uri? = null
        var connection: HttpURLConnection? = null
        try {
            connection = (URL(url).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 120_000
                useCaches = false
            }
            connection.connect()
            if (connection.responseCode !in 200..299) {
                throw java.io.IOException("HTTP " + connection.responseCode)
            }

            val mime = when (fileName.substringAfterLast('.', "").lowercase(Locale.ROOT)) {
                "webm" -> "video/webm"
                "mkv" -> "video/x-matroska"
                else -> "video/mp4"
            }

            if (Build.VERSION.SDK_INT >= 29) {
                val values = ContentValues().apply {
                    put(MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(MediaStore.Downloads.MIME_TYPE, mime)
                    put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Mystery Vault")
                    put(MediaStore.Downloads.IS_PENDING, 1)
                }
                outputUri = contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values)
                    ?: throw java.io.IOException("Could not create Downloads entry")
                contentResolver.openOutputStream(outputUri!!).use { output ->
                    requireNotNull(output) { "Could not open Downloads output" }
                    connection.inputStream.use { input -> copyStream(input, output) }
                }
                contentResolver.update(
                    outputUri!!,
                    ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) },
                    null,
                    null
                )
            } else {
                val dir = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS)
                    ?: throw java.io.IOException("Downloads directory unavailable")
                dir.mkdirs()
                val file = File(dir, fileName)
                FileOutputStream(file).use { output ->
                    connection.inputStream.use { input -> copyStream(input, output) }
                }
            }

            runOnUiThread {
                Toast.makeText(this, "Download complete: " + fileName, Toast.LENGTH_LONG).show()
            }
        } catch (t: Throwable) {
            outputUri?.let { try { contentResolver.delete(it, null, null) } catch (_: Throwable) {} }
            runOnUiThread {
                Toast.makeText(this, "Download failed: " + (t.message ?: "unknown error"), Toast.LENGTH_LONG).show()
            }
        } finally {
            connection?.disconnect()
        }
    }

    private fun copyStream(input: InputStream, output: java.io.OutputStream) {
        val buffer = ByteArray(128 * 1024)
        while (true) {
            val read = input.read(buffer)
            if (read < 0) break
            output.write(buffer, 0, read)
        }
        output.flush()
    }

    @Deprecated("Deprecated in Android API 33")
    override fun onBackPressed() {
        if (fullscreenView != null) { exitFullscreen(); return }
        super.onBackPressed()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback)
        }
        exitFullscreen()
        server?.stop()
        server = null
        webView.destroy()
        super.onDestroy()
    }
}