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

/**
 * Initial Android host for the existing Mystery Vault web UI.
 *
 * The Android-local backend is intentionally a separate porting milestone:
 * this activity expects it at 127.0.0.1:3000 and never exposes it on the LAN.
 */
class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var statusView: TextView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = FrameLayout(this)
        webView = WebView(this)
        statusView = TextView(this).apply {
            text = "Starting Mystery Vault…"
            textSize = 16f
            setPadding(40, 40, 40, 40)
            visibility = View.VISIBLE
        }
        root.addView(webView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.MATCH_PARENT
        ))
        root.addView(statusView, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ))
        setContentView(root)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = true
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                val isLocal = uri.host == LOCAL_HOST && uri.scheme == "http"
                if (isLocal) return false

                if (uri.scheme == "https") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri))
                }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) {
                statusView.visibility = View.GONE
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: android.webkit.WebResourceError
            ) {
                if (request.isForMainFrame) {
                    statusView.text = "Mystery Vault's local service is not running yet.\n\nAndroid backend integration is the next porting step."
                    statusView.visibility = View.VISIBLE
                }
            }
        }

        webView.loadUrl(LOCAL_APP_URL)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
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
