plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Firebase activates once the project configuration file is added.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

android {
    namespace = "com.mysteryvault.kotlin"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.mysteryvault.kotlin"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        ndk { abiFilters += listOf("arm64-v8a") }

        val tmdbToken = providers.environmentVariable("TMDB_READ_TOKEN")
            .orElse(providers.environmentVariable("TMDB_TOKEN"))
            .orElse(providers.gradleProperty("TMDB_READ_TOKEN"))
            .orElse(providers.gradleProperty("TMDB_TOKEN"))
            .orElse("")
            .get()
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
        buildConfigField("String", "TMDB_TOKEN", "\"$tmdbToken\"")
        buildConfigField("String", "YTS_API_BASE", "\"https://yts.lt/api/v2/list_movies.json\"")
        buildConfigField("String", "EMBED_SERVERS", "\"vidcore,vidsrc\"")
        buildConfigField("String", "EMBED_VIDCORE_NAME", "\"Vidcore\"")
        buildConfigField("String", "EMBED_VIDCORE_BASE_URL", "\"https://vidcore.org\"")
        buildConfigField("String", "EMBED_VIDCORE_MOVIE_PATH", "\"/embed/movie/{id}\"")
        buildConfigField("String", "EMBED_VIDCORE_TV_PATH", "\"/embed/tv/{id}/{season}/{episode}\"")
        buildConfigField("String", "EMBED_VIDSRC_NAME", "\"Vidsrc\"")
        buildConfigField("String", "EMBED_VIDSRC_BASE_URL", "\"https://vidsrc.mov\"")
        buildConfigField("String", "EMBED_VIDSRC_MOVIE_PATH", "\"/embed/movie/{id}\"")
        buildConfigField("String", "EMBED_VIDSRC_TV_PATH", "\"/embed/tv/{id}/{season}/{episode}\"")
    }

    buildFeatures { buildConfig = true }

    packaging {
        jniLibs { useLegacyPackaging = true }
    }


    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("com.frostwire:jlibtorrent:2.0.12.9")
    implementation("com.frostwire:jlibtorrent-android-arm64:2.0.12.9")

    implementation(platform("com.google.firebase:firebase-bom:35.1.0"))
    implementation("com.google.firebase:firebase-auth")
    implementation("com.google.firebase:firebase-functions")
    implementation("com.google.firebase:firebase-messaging")
    implementation("com.google.zxing:core:3.5.3")
}
