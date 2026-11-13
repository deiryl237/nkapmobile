package cm.nkapmobile.engine

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.provider.Settings
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

/**
 * État du moteur + activation. Le moteur vit dans le service d'accessibilité ;
 * la démo offline (P1→P5) se déclenche par la bulle, sur n'importe quel écran.
 */
class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = 48
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(pad, pad * 2, pad, pad)
        }

        fun tv(text: String, size: Float = 16f) = TextView(this).apply {
            this.text = text; textSize = size
        }

        root.addView(tv("nkap engine — moteur de rendu + contexte (M1+M4)", 20f))
        root.addView(View(this).apply { minimumHeight = 24 })
        root.addView(tv(
            "1. Active « nkap engine » dans Accessibilité (bouton ci-dessous)\n" +
            "2. Ouvre « KwikPay — démo » (parcours imposé simulé)\n" +
            "3. Tape la bulle 🧠 : le parcours P1→P5 se joue sur l'écran réel\n" +
            "4. Fonctionne AUSSI par-dessus Chrome / toute app (bulle → tour suivant)\n\n" +
            "Mode : démo OFFLINE (fixtures embarquées).\n" +
            "Mode serveur : régler l'URL WS dans le code (M2)."
        ))
        root.addView(View(this).apply { minimumHeight = 24 })
        root.addView(Button(this).apply {
            text = "Ouvrir les paramètres d'accessibilité"
            setOnClickListener { startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) }
        })
        root.addView(Button(this).apply {
            text = "Ouvrir KwikPay — démo (écran cible)"
            setOnClickListener { startActivity(Intent(this@MainActivity, cm.nkapmobile.engine.demo.DemoFintechActivity::class.java)) }
        })
        setContentView(root)
    }
}
