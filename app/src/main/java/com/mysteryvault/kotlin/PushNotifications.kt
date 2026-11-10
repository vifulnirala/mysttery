package com.mysteryvault.kotlin

import android.content.Context
import android.os.Build
import com.google.android.gms.tasks.Task
import com.google.android.gms.tasks.Tasks
import com.google.firebase.FirebaseApp
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.messaging.FirebaseMessaging

/** Anonymous per-installation identity; all privileged operations go through callable functions. */
object PushNotifications {
    private const val FUNCTIONS_REGION = "us-central1"

    fun ensureRegistered(context: Context): Task<Any> {
        if (FirebaseApp.getApps(context).isEmpty()) {
            return Tasks.forException(IllegalStateException(
                "Firebase is not configured yet. Add app/google-services.json and rebuild the APK."
            ))
        }
        return ensureSignedIn().continueWithTask { authTask ->
            authTask.result ?: throw IllegalStateException("Could not establish this device's Firebase identity.")
            FirebaseMessaging.getInstance().token.continueWithTask { tokenTask ->
                if (!tokenTask.isSuccessful) throw tokenTask.exception ?: IllegalStateException("Could not obtain an FCM token.")
                val token = tokenTask.result ?: throw IllegalStateException("FCM returned an empty registration token.")
                FirebaseFunctions.getInstance(FUNCTIONS_REGION).getHttpsCallable("registerInstallation").call(mapOf(
                    "fcmToken" to token,
                    "deviceName" to (Build.MANUFACTURER + " " + Build.MODEL).trim().take(80)
                ))
            }
        }.continueWith { result ->
            if (!result.isSuccessful) throw result.exception ?: IllegalStateException("Device registration failed.")
            result.result?.data ?: mapOf("registered" to true)
        }
    }

    fun registerRefreshedToken(context: Context, token: String): Task<Any> {
        if (FirebaseApp.getApps(context).isEmpty()) return Tasks.forException(IllegalStateException("Firebase is not configured."))
        return ensureSignedIn().continueWithTask {
            FirebaseFunctions.getInstance(FUNCTIONS_REGION).getHttpsCallable("registerInstallation").call(mapOf(
                "fcmToken" to token,
                "deviceName" to (Build.MANUFACTURER + " " + Build.MODEL).trim().take(80)
            ))
        }.continueWith { result ->
            if (!result.isSuccessful) throw result.exception ?: IllegalStateException("FCM token refresh registration failed.")
            result.result?.data ?: mapOf("registered" to true)
        }
    }

    fun call(context: Context, functionName: String, data: Map<String, Any> = emptyMap()): Task<Any> {
        return ensureRegistered(context).continueWithTask {
            FirebaseFunctions.getInstance(FUNCTIONS_REGION).getHttpsCallable(functionName).call(data)
        }.continueWith { result ->
            if (!result.isSuccessful) throw result.exception ?: IllegalStateException("Firebase request failed.")
            result.result?.data ?: emptyMap<String, Any>()
        }
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