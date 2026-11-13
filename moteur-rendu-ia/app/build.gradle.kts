plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "cm.nkapmobile.engine"
    compileSdk = 34

    defaultConfig {
        applicationId = "cm.nkapmobile.engine"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    packaging { resources.excludes += "META-INF/*" }
}

dependencies {
    // WebSocket du contrat (§1 docs/02) — déclarée au jury (règlement §9)
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    testImplementation("junit:junit:4.13.2")
}
