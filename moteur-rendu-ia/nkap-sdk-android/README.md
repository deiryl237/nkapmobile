# NkapSDK Android (`:nkap-sdk-android` `.aar`)

Couche d'accessibilité linguistique et d'annotations visuelles **Solar Jarvis** pour applications bancaires & Mobile Money Android (contrat `docs/02` v1.2).

## Intégration en 3 lignes (SDK `.aar`)

1. Ajoutez `nkap-sdk-android-release.aar` (ou `implementation(project(":nkap-sdk-android"))`) dans `app/build.gradle.kts` :

```kotlin
dependencies {
    implementation(files("libs/nkap-sdk-android-release.aar"))
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}
```

2. Attachez Nkap dans votre `Activity` bancaire (aucune permission d'accessibilité requise) :

```kotlin
class MainBankingActivity : Activity() {
    private var nkap: NkapSession? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_banking)
        nkap = NkapSDK.attach(this, NkapConfig(brainUrl = "https://13.51.168.107.sslip.io"))
    }

    override fun onDestroy() {
        nkap?.destroy()
        super.onDestroy()
    }
}
```

## Ce que le SDK fournit automatiquement

- **Constellation neuronale dorée (60 fps)** sans contour, déplaçable par glisser-déposer, qui pulse en continu pendant la voix.
- **Tiroir de chat contextuel** (chips par écran, éducation financière, saisie libre + micro Push-to-Talk).
- **Moteur de rendu natif Canvas v1.2** : `circle`, `box`, `underline`, `highlight`, `frame`, `arrow`, `write`, `callout`, `num` (①②③), `strike`, `check` (✓), `cross` (✗), `notebook` (`lines`, `flow`, `bars`, `table`, `choices`) + sous-titres.
- **Sécurité par conception** : les champs `EditText` / `PASSWORD` / PIN ne sont jamais lus ni transmis au serveur ; budget ≤ 3 marques simultanées.
