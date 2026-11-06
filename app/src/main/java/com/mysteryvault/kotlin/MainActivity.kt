package com.mysteryvault.kotlin

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var server: LocalHttpServer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this).apply {
            webViewClient = WebViewClient()
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
        }
        setContentView(webView)
        Thread {
            try {
                val httpServer = LocalHttpServer(applicationContext)
                val port = httpServer.start()
                server = httpServer
                runOnUiThread { webView.loadUrl("http://127.0.0.1:$port/") }
            } catch (t: Throwable) {
                runOnUiThread {
                    webView.loadData(
                        "<html><body><h2>Mystery Vault failed to start</h2><pre>${t.message}</pre></body></html>",
                        "text/html", "UTF-8"
                    )
                }
            }
        }.start()
    }

    override fun onDestroy() {
        server?.stop()
        server = null
        webView.destroy()
        super.onDestroy()
    }
}