package com.mysteryvault.kotlin

import android.content.Context
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.messaging.FirebaseMessaging
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

/** Firebase supplies per-installation identity and FCM; privileged operations use the authenticated Worker API. */
object PushNotifications {
    private val networkExecutor = Executors.newSingleThreadExecutor()

    fun ensureRegistered(context: Context): Task<Any> {
        if (FirebaseApp.getApps(context).isEmpty()) {
            return Tasks.forException(IllegalStateException(
                "Firebase is not configured yet. Add app/google-services.json and rebuild the APK."
            ))
        }
        return ensureSignedIn().continueWithTask { authTask ->
            val user = authTask.result ?: throw IllegalStateException("Could not establish this device's Firebase identity.")
            FirebaseMessaging.getInstance().token.continueWithTask { tokenTask ->
                if (!tokenTask.isSuccessful) throw tokenTask.exception ?: IllegalStateException("Could not obtain an FCM token.")
                val token = tokenTask.result ?: throw IllegalStateException("FCM returned an empty registration token.")
                Tasks.call(networkExecutor) {
                    post(user, "register", mapOf(
                        "fcmToken" to token,
                        "deviceName" to (android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL).trim().take(80)
                    ))
                }
            }
        }.continueWith { result ->
            if (!result.isSuccessful) throw result.exception ?: IllegalStateException("Device registration failed.")
            result.result ?: mapOf("registered" to true)
        }
    }

    fun registerRefreshedToken(context: Context, token: String): Task<Any> {
        if (FirebaseApp.getApps(context).isEmpty()) return Tasks.forException(IllegalStateException("Firebase is not configured."))
        return ensureSignedIn().continueWithTask { authTask ->
            val user = authTask.result ?: throw IllegalStateException("Could not establish this device's Firebase identity.")
            Tasks.call(networkExecutor) {
                post(user, "register", mapOf(
                    "fcmToken" to token,
                    "deviceName" to (android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL).trim().take(80)
                ))
            }
        }.continueWith { result ->
            if (!result.isSuccessful) throw result.exception ?: IllegalStateException("FCM token refresh registration failed.")
            result.result ?: mapOf("registered" to true)
        }
    }

    fun call(context: Context, functionName: String, data: Map<String, Any> = emptyMap()): Task<Any> {
        val route = when (functionName) {
            "createPairingCode" -> "pairing/create"
            "joinPairingCode" -> "pairing/join"
            "listLinkedDevices" -> "devices"
            "sendNotification" -> "notify"
            "sendTestNotification" -> "notify/test"
            "unlinkDevice" -> "unlink"
            else -> return Tasks.forException(IllegalArgumentException("Unsupported push operation."))
        }
        return ensureRegistered(context).continueWithTask { registration ->
            if (!registration.isSuccessful) {
                throw registration.exception ?: IllegalStateException("This installation could not register with Firebase.")
            }
            val user = FirebaseAuth.getInstance().currentUser
                ?: throw IllegalStateException("This installation is not signed in.")
            Tasks.call(networkExecutor) { post(user, route, data) }
        }
    }

    private fun post(user: FirebaseUser, route: String, data: Map<String, Any> = emptyMap()): Any {
        val baseUrl = BuildConfig.PUSH_API_BASE_URL.trim().trimEnd('/')
        if (!baseUrl.startsWith("https://") || baseUrl.contains("YOUR-WORKER", ignoreCase = true)) {
            throw IllegalStateException("The push API URL has not been configured in the Android build.")
        }
        val idToken = Tasks.await(user.getIdToken(false)).token
            ?: throw IllegalStateException("Firebase did not provide an identity token.")
        val connection = (URL("$baseUrl/v1/$route").openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 20000
            doOutput = true
            instanceFollowRedirects = false
            useCaches = false
            setRequestProperty("Authorization", "Bearer $idToken")
            setRequestProperty("Content-Type", "application/json; charset=utf-8")
            setRequestProperty("Accept", "application/json")
        }
        try {
            val payload = JSONObject(data).toString().toByteArray(Charsets.UTF_8)
            connection.outputStream.use { it.write(payload) }
            val status = connection.responseCode
            val responseStream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseText = responseStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val response = try { JSONObject(responseText) } catch (_: Throwable) {
                throw IllegalStateException("The push service returned an invalid response.")
            }
            if (status !in 200..299) {
                throw IllegalStateException(response.optString("error").ifBlank { "Push request failed (HTTP $status)." })
            }
            return jsonValue(response)
        } finally {
            connection.disconnect()
        }
    }

    private fun jsonValue(value: JSONObject): Map<String, Any> {
        val result = LinkedHashMap<String, Any>()
        val keys = value.keys()
        while (keys.hasNext()) {
            val key = keys.next()
            when (val item = value.opt(key)) {
                is JSONObject -> result[key] = jsonValue(item)
                is JSONArray -> result[key] = (0 until item.length()).map { index ->
                    when (val child = item.opt(index)) {
                        is JSONObject -> jsonValue(child)
                        is JSONArray -> child.toString()
                        null, JSONObject.NULL -> ""
                        else -> child
                    }
                }
                null, JSONObject.NULL -> Unit
                else -> result[key] = item
            }
        }
        return result
    }

    private fun ensureSignedIn(): Task<FirebaseUser> {
        val auth = FirebaseAuth.getInstance()
        auth.currentUser?.let { return Tasks.forResult(it) }
        return auth.signInAnonymously().continueWith { result ->
            if (!result.isSuccessful) throw result.exception ?: IllegalStateException("Anonymous Firebase sign-in failed.")
            result.result?.user ?: throw IllegalStateException("Firebase did not return an installation identity.")
        }
    }
}
