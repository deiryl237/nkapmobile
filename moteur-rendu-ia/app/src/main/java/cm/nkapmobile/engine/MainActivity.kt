package cm.nkapmobile.engine

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import cm.nkapmobile.sdk.NkapSDK
import cm.nkapmobile.sdk.ui.JarvisOrbView

/**
 * Centre de contrôle NkapMobile Android (v1.2 — Solar Jarvis) :
 * - Configure et teste la connexion au serveur Cerveau EC2 (/health)
 * - Mode 1 : Démo SDK intégré (.aar en 3 lignes, zéro permission requise)
 * - Mode 2 : Mode Universel (AccessibilityService par-dessus n'importe quelle app bancaire)
 */
class MainActivity : Activity() {

    private lateinit var urlInput: EditText
    private lateinit var statusView: TextView
    private var d: Float = 1f
    private fun dp(v: Int): Int = (v * d).toInt()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        d = resources.displayMetrics.density

        val prefs = getSharedPreferences("nkap_sdk", Context.MODE_PRIVATE)
        val savedUrl = prefs.getString("brain_url", NkapSDK.DEFAULT_BRAIN_URL) ?: NkapSDK.DEFAULT_BRAIN_URL

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(42), dp(20), dp(28))
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#1D150E"), Color.parseColor("#0B101D"))
            )
        }

        // En-tête avec mini orbe neuronal Jarvis animé
        val hero = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, dp(18))
        }
        val miniOrb = JarvisOrbView(this, onTap = { pingBrain() }).apply {
            layoutParams = LinearLayout.LayoutParams(dp(58), dp(58)).apply { rightMargin = dp(12) }
        }
        val heroText = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        heroText.addView(TextView(this).apply {
            text = "Nkap Copilote · SDK v1.2"
            textSize = 19f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FDE68A"))
        })
        heroText.addView(TextView(this).apply {
            text = "Accessibilité bancaire vivante · Android (.aar + Universel)"
            textSize = 12f
            setTextColor(Color.parseColor("#A8A29E"))
        })
        statusView = TextView(this).apply {
            text = "● Vérification du cerveau…"
            textSize = 11.5f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#F5B700"))
            setPadding(0, dp(5), 0, 0)
        }
        heroText.addView(statusView)
        hero.addView(miniOrb)
        hero.addView(heroText)
        root.addView(hero)

        // Carte Serveur Cerveau M2
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(14), dp(14), dp(14), dp(14))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT).apply {
                bottomMargin = dp(14)
            }
            background = GradientDrawable().apply {
                cornerRadius = 16f * d
                setColor(Color.argb(18, 255, 248, 235))
                setStroke(dp(1), Color.argb(70, 245, 183, 0))
            }
        }
        card.addView(TextView(this).apply {
            text = "SERVEUR CERVEAU (M2)"
            textSize = 11f
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FCD34D"))
            setPadding(0, 0, 0, dp(8))
        })

        urlInput = EditText(this).apply {
            setText(savedUrl)
            hint = NkapSDK.DEFAULT_BRAIN_URL
            setHintTextColor(Color.parseColor("#78716C"))
            setTextColor(Color.parseColor("#FEF9EE"))
            textSize = 13f
            isSingleLine = true
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = GradientDrawable().apply {
                cornerRadius = 11f * d
                setColor(Color.argb(185, 8, 12, 22))
                setStroke(dp(1), Color.argb(80, 245, 183, 0))
            }
        }
        card.addView(urlInput)

        val btnRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(10), 0, 0)
        }
        fun presetBtn(label: String, onClick: () -> Unit) = Button(this).apply {
            text = label
            textSize = 11.5f
            isAllCaps = false
            setTextColor(Color.parseColor("#FDE68A"))
            layoutParams = LinearLayout.LayoutParams(0, dp(38), 1f).apply { rightMargin = dp(6) }
            background = GradientDrawable().apply {
                cornerRadius = 10f * d
                setColor(Color.argb(30, 245, 183, 0))
                setStroke(dp(1), Color.argb(85, 245, 183, 0))
            }
            setOnClickListener { onClick() }
        }
        btnRow.addView(presetBtn("EC2 Prod") {
            urlInput.setText(NkapSDK.DEFAULT_BRAIN_URL)
            saveUrlAndPing()
        })
        btnRow.addView(presetBtn("Local (10.0.2.2)") {
            urlInput.setText("http://10.0.2.2:8000")
            saveUrlAndPing()
        })
        btnRow.addView(presetBtn("Tester") {
            saveUrlAndPing()
        })
        card.addView(btnRow)
        root.addView(card)

        // Bouton principal 1 : Démo SDK Intégré (.aar 3 lignes)
        root.addView(Button(this).apply {
            text = "Lancer Banque Démo · SDK intégré (.aar)"
            textSize = 14.5f
            isAllCaps = false
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#140E07"))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(52)).apply {
                bottomMargin = dp(12)
            }
            background = GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                intArrayOf(Color.parseColor("#F5B700"), Color.parseColor("#FF8C42"))
            ).apply { cornerRadius = 14f * d }
            setOnClickListener {
                saveUrlOnly()
                startActivity(Intent(this@MainActivity, cm.nkapmobile.engine.demo.DemoFintechActivity::class.java))
            }
        })

        // Bouton secondaire 2 : Mode Universel AccessibilityService
        root.addView(Button(this).apply {
            text = "Activer Mode Universel (AccessibilityService)"
            textSize = 13.5f
            isAllCaps = false
            typeface = Typeface.DEFAULT_BOLD
            setTextColor(Color.parseColor("#FEF3C7"))
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(48)).apply {
                bottomMargin = dp(16)
            }
            background = GradientDrawable().apply {
                cornerRadius = 14f * d
                setColor(Color.argb(26, 255, 248, 235))
                setStroke(dp(1), Color.argb(95, 245, 183, 0))
            }
            setOnClickListener {
                saveUrlOnly()
                startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))
            }
        })

        // Bandeau Sécurité
        root.addView(TextView(this).apply {
            text = "🛡️ Sécurité : les champs PIN / mot de passe ne sont jamais lus ni transmis. Les montants et bénéficiaires ne sont jamais modifiés."
            textSize = 11.5f
            setTextColor(Color.parseColor("#A7F3D0"))
            setPadding(dp(12), dp(10), dp(12), dp(10))
            background = GradientDrawable().apply {
                cornerRadius = 12f * d
                setColor(Color.argb(25, 52, 211, 153))
                setStroke(dp(1), Color.argb(75, 52, 211, 153))
            }
        })

        val scroll = ScrollView(this).apply {
            isFillViewport = true
            addView(root)
        }
        setContentView(scroll)
        pingBrain()
        ensureMicPermission()
    }

    private fun ensureMicPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
            checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 701)
        }
    }

    private fun saveUrlOnly(): String {
        val url = urlInput.text?.toString()?.trim().orEmpty().ifBlank { NkapSDK.DEFAULT_BRAIN_URL }
        getSharedPreferences("nkap_sdk", Context.MODE_PRIVATE).edit().putString("brain_url", url).apply()
        return url
    }

    private fun saveUrlAndPing() {
        saveUrlOnly()
        pingBrain()
    }

    private fun pingBrain() {
        val url = saveUrlOnly()
        statusView.text = "● Connexion au cerveau…"
        statusView.setTextColor(Color.parseColor("#F5B700"))
        NkapSDK.checkHealth(url) { info ->
            runOnUiThread {
                if (info.ok) {
                    statusView.text = "● En ligne · ${info.model} · ${info.latencyMs} ms"
                    statusView.setTextColor(Color.parseColor("#34D399"))
                } else {
                    statusView.text = "● Serveur injoignable (${info.error ?: "erreur"})"
                    statusView.setTextColor(Color.parseColor("#FB7185"))
                }
            }
        }
    }
}
