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
            text = "Preparing Mystery Vault…"
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
                    statusView.text = "Mystery Vault backend could not be reached. Reopen the app or check its runtime logs."
                    statusView.visibility = View.VISIBLE
                }
            }
        }

        val backendDir = File(filesDir, "backend")
        try {
            copyAssetFolder("backend", backendDir)
        } catch (error: Exception) {
            statusView.text = "Unable to prepare Mystery Vault backend: ${error.message}"
            return
        }
        val cache = File(cacheDir, "node-tmp").apply { mkdirs() }

        Thread {
            try {
                val result = startNode(backendDir.absolutePath, cache.absolutePath)
                runOnUiThread {
                    statusView.text = "Mystery Vault backend stopped (exit code $result)."
                    statusView.visibility = View.VISIBLE
                }
            } catch (error: Throwable) {
                runOnUiThread {
                    statusView.text = "Unable to start Mystery Vault backend: ${error.message}"
                    statusView.visibility = View.VISIBLE
                }
            }
        }.apply { name = "mystery-vault-node"; isDaemon = true }.start()

        webView.postDelayed({ webView.loadUrl(LOCAL_APP_URL) }, 1800)
    }

    private fun copyAssetFolder(assetPath: String, destination: File) {
        destination.mkdirs()
        val entries = assets.list(assetPath) ?: emptyArray()
        for (entry in entries) {
            val childAssetPath = "$assetPath/$entry"
            val childDestination = File(destination, entry)
            val children = assets.list(childAssetPath) ?: emptyArray()
            if (children.isNotEmpty()) {
                copyAssetFolder(childAssetPath, childDestination)
            } else {
                assets.open(childAssetPath).use { input ->
                    childDestination.parentFile?.mkdirs()
                    childDestination.outputStream().use { output -> input.copyTo(output) }
                }
            }
        }
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
