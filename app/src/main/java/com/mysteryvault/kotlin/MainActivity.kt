package com.mysteryvault.kotlin

import android.app.Activity
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var server: LocalHttpServer? = null
    private var fullscreenView: View? = null
    private var fullscreenCallback: WebChromeClient.CustomViewCallback? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            webViewClient = WebViewClient()
            webChromeClient = object : WebChromeClient() {
                override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                    if (fullscreenView != null) {
                        callback.onCustomViewHidden()
                        return
                    }

                    fullscreenView = view
                    fullscreenCallback = callback
                    requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                    window.setFlags(
                        WindowManager.LayoutParams.FLAG_FULLSCREEN,
                        WindowManager.LayoutParams.FLAG_FULLSCREEN
                    )
                    window.decorView.systemUiVisibility =
                        View.SYSTEM_UI_FLAG_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                        View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                        View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                        View.SYSTEM_UI_FLAG_LAYOUT_STABLE

                    val decor = window.decorView as FrameLayout
                    decor.addView(
                        view,
                        FrameLayout.LayoutParams(
                            FrameLayout.LayoutParams.MATCH_PARENT,
                            FrameLayout.LayoutParams.MATCH_PARENT
                        )
                    )
                    view.setBackgroundColor(Color.BLACK)
                }

                override fun onHideCustomView() {
                    exitFullscreen()
                }
            }

            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportZoom(false)
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
                        "<html><body><h2>Mystery Vault failed to start</h2><pre>" + t.message + "</pre></body></html>",
                        "text/html", "UTF-8"
                    )
                }
            }
        }.start()
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
    }

    override fun onBackPressed() {
        if (fullscreenView != null) {
            exitFullscreen()
            return
        }
        super.onBackPressed()
    }

    override fun onDestroy() {
        exitFullscreen()
        server?.stop()
        server = null
        webView.destroy()
        super.onDestroy()
    }
}