package com.mysteryvault.android

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.TextView
import java.io.File

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var statusView: TextView

    private external fun startNode(projectDir: String, cacheDir: String): Int

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        System.loadLibrary("node_bridge")

        val root = FrameLayout(this)
        webView = WebView(this)
        statusView = TextView(this).apply {
            text = "Starting embedded Node.js…"
            textSize = 16f
            setPadding(40, 40, 40, 40)
        }
        root.addView(webView, FrameLayout.LayoutParams(-1, -1))
        root.addView(statusView, FrameLayout.LayoutParams(-1, -2))
        setContentView(root)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = true
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.host == LOCAL_HOST && uri.scheme == "http") return false
                if (uri.scheme == "https") startActivity(Intent(Intent.ACTION_VIEW, uri))
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                statusView.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: android.webkit.WebResourceError) {
                if (request.isForMainFrame) {
                    statusView.text = "Embedded Node.js service did not start. Check the app runtime logs."
                    statusView.visibility = View.VISIBLE
                }
            }
        }

        val projectDir = File(filesDir, "nodejs").apply { mkdirs() }
        assets.open("nodejs/index.js").use { input ->
            File(projectDir, "index.js").outputStream().use { output -> input.copyTo(output) }
        }
        val cache = File(cacheDir, "node-tmp").apply { mkdirs() }

        Thread {
            try {
                startNode(projectDir.absolutePath, cache.absolutePath)
            } catch (error: Throwable) {
                runOnUiThread {
                    statusView.text = "Unable to start embedded Node.js: ${error.message}"
                    statusView.visibility = View.VISIBLE
                }
            }
        }.apply { name = "mystery-vault-node"; isDaemon = true }.start()

        webView.postDelayed({ webView.loadUrl(LOCAL_APP_URL) }, 1200)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        if (::webView.isInitialized) {
            webView.stopLoading()
            webView.destroy()
        }
        super.onDestroy()
    }

    companion object {
        private const val LOCAL_HOST = "127.0.0.1"
        private const val LOCAL_APP_URL = "http://127.0.0.1:3000"
    }
}
