package com.mysteryvault.kotlin

import android.app.Activity
import android.content.ContentValues
import android.content.Intent
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.RectF
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.ValueCallback
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.Toast
import java.io.ByteArrayInputStream
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var rootContainer: FrameLayout
    private var splashView: ScoobySplashView? = null
    private val splashHandler = Handler(Looper.getMainLooper())
    private val splashStartedAt = android.os.SystemClock.elapsedRealtime()
    private var pageLoaded = false
    private val hideSplashRunnable = Runnable { maybeHideSplash() }
    private var server: LocalHttpServer? = null
    private var fullscreenView: View? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null
    private var backExitPending = false
    private val backExitHandler = Handler(Looper.getMainLooper())
    private val clearBackExitPending = Runnable { backExitPending = false }

    private val backCallback = android.window.OnBackInvokedCallback {
        handleBackNavigation()
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
                override fun onPageFinished(view: WebView, url: String) {
                    super.onPageFinished(view, url)
                    if (url.startsWith("http://127.0.0.1:")) {
                        pageLoaded = true
                        scheduleSplashDismissal()
                    }
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    val host = request.url.host?.lowercase(Locale.ROOT) ?: return true
                    // Block known ad-network navigations inside the player iframe too,
                    // not just top-level redirects. Popup windows are disabled separately.
                    if (isKnownAdvertisingHost(host)) return true
                    // Keep the app shell on its loopback origin.
                    return request.isForMainFrame && host != "127.0.0.1"
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
                override fun onShowFileChooser(
                    webView: WebView,
                    filePathCallback: ValueCallback<Array<Uri>>,
                    fileChooserParams: FileChooserParams
                ): Boolean {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = filePathCallback
                    return try {
                        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE)
                            // Do not MIME-filter the Android DocumentsUI. Many file
                            // providers report .csv files as application/octet-stream
                            // or another generic MIME type, which makes valid CSV files
                            // appear greyed out. The web layer validates the .csv extension.
                            type = "*/*"
                        }
                        startActivityForResult(intent, FILE_CHOOSER_REQUEST_CODE)
                        true
                    } catch (_: Throwable) {
                        fileChooserCallback?.onReceiveValue(null)
                        fileChooserCallback = null
                        false
                    }
                }

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
        rootContainer = FrameLayout(this).apply {
            addView(webView, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
        }
        splashView = ScoobySplashView(this)
        rootContainer.addView(splashView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        setContentView(rootContainer)

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


    private fun scheduleSplashDismissal() {
        val remaining = (SPLASH_MIN_DURATION_MS -
            (android.os.SystemClock.elapsedRealtime() - splashStartedAt)).coerceAtLeast(0L)
        splashHandler.removeCallbacks(hideSplashRunnable)
        splashHandler.postDelayed(hideSplashRunnable, remaining)
    }

    private fun maybeHideSplash() {
        if (!pageLoaded) return
        val elapsed = android.os.SystemClock.elapsedRealtime() - splashStartedAt
        if (elapsed < SPLASH_MIN_DURATION_MS) {
            splashHandler.postDelayed(hideSplashRunnable, SPLASH_MIN_DURATION_MS - elapsed)
            return
        }
        val overlay = splashView ?: return
        rootContainer.removeView(overlay)
        overlay.stop()
        splashView = null
    }

    private inner class ScoobySplashView(context: android.content.Context) : View(context) {
        private val sprite: Bitmap = assets.open("scooby_running.png").use {
            BitmapFactory.decodeStream(it)
        } ?: throw IllegalStateException("Could not decode Scooby sprite sheet")
        private val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        private val source = Rect()
        private val destination = RectF()
        private val frameWidth = sprite.width / SPRITE_COLUMNS
        private val frameHeight = sprite.height / SPRITE_ROWS
        private var frame = 0
        private var running = true
        private val frameTicker = object : Runnable {
            override fun run() {
                if (!running) return
                frame = (frame + 1) % SPRITE_FRAME_COUNT
                invalidate()
                splashHandler.postDelayed(this, SPRITE_FRAME_INTERVAL_MS)
            }
        }

        init {
            setBackgroundColor(Color.rgb(6, 9, 20))
            splashHandler.postDelayed(frameTicker, SPRITE_FRAME_INTERVAL_MS)
        }

        override fun onDraw(canvas: Canvas) {
            super.onDraw(canvas)
            val column = frame % SPRITE_COLUMNS
            val row = frame / SPRITE_COLUMNS
            source.set(column * frameWidth, row * frameHeight,
                (column + 1) * frameWidth, (row + 1) * frameHeight)
            val scale = minOf(width * 0.82f / frameWidth, height * 0.48f / frameHeight)
            val drawWidth = frameWidth * scale
            val drawHeight = frameHeight * scale
            val left = (width - drawWidth) / 2f
            val top = (height - drawHeight) / 2f
            destination.set(left, top, left + drawWidth, top + drawHeight)
            canvas.drawBitmap(sprite, source, destination, paint)
        }

        fun stop() {
            running = false
            splashHandler.removeCallbacks(frameTicker)
            sprite.recycle()
        }
    }

    private fun isKnownAdvertisingHost(host: String): Boolean {
        val blocked = listOf(
            // Google and programmatic advertising
            "doubleclick.net", "googlesyndication.com", "googleadservices.com",
            "adservice.google.com", "adnxs.com", "appnexus.com", "criteo.com",
            "rubiconproject.com", "pubmatic.com", "openx.net", "casalemedia.com",
            "smartadserver.com", "adform.net", "sharethrough.com", "lijit.com",
            // Pop-under, redirect and video-ad networks commonly used by embeds
            "popads.net", "popcash.net", "exoclick.com", "trafficjunky.com",
            "adsterra.com", "propellerads.com", "juicyads.com", "hilltopads.net",
            "bidvertiser.com", "adskeeper.com", "ad-maven.com", "jads.co",
            "trafficstars.com", "onclickads.net", "onclickalgo.com", "onclckmn.com",
            "exdynsrv.com", "tsyndicate.com", "adtng.com", "bidgear.com",
            "taboola.com", "outbrain.com", "mgid.com", "monetag.com"
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

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != FILE_CHOOSER_REQUEST_CODE) return
        val callback = fileChooserCallback ?: return
        fileChooserCallback = null
        val result = if (resultCode == RESULT_OK && data != null) {
            WebChromeClient.FileChooserParams.parseResult(resultCode, data)
        } else {
            null
        }
        callback.onReceiveValue(result)
    }

    private fun handleBackNavigation() {
        if (fullscreenView != null) {
            exitFullscreen()
            return
        }

        if (backExitPending) {
            backExitHandler.removeCallbacks(clearBackExitPending)
            backExitPending = false
            finish()
            return
        }

        backExitPending = true
        Toast.makeText(this, "Press back again to exit the app.", Toast.LENGTH_SHORT).show()
        backExitHandler.postDelayed(clearBackExitPending, BACK_EXIT_WINDOW_MS)
    }

    @Deprecated("Deprecated in Android API 33")
    override fun onBackPressed() {
        handleBackNavigation()
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= 33) {
            onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback)
        }
        backExitHandler.removeCallbacks(clearBackExitPending)
        splashHandler.removeCallbacks(hideSplashRunnable)
        splashView?.stop()
        splashView = null
        exitFullscreen()
        server?.stop()
        server = null
        webView.destroy()
        super.onDestroy()
    }
    companion object {
        private const val FILE_CHOOSER_REQUEST_CODE = 1001
        private const val BACK_EXIT_WINDOW_MS = 2000L
        private const val SPLASH_MIN_DURATION_MS = 3500L
        private const val SPRITE_COLUMNS = 4
        private const val SPRITE_ROWS = 2
        private const val SPRITE_FRAME_COUNT = SPRITE_COLUMNS * SPRITE_ROWS
        private const val SPRITE_FRAME_INTERVAL_MS = 100L
    }

}