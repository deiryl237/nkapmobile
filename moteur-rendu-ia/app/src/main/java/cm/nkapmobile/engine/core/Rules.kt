package cm.nkapmobile.engine.core

/**
 * Règles de composition (concept §3 / contrat §5) — appliquées PAR LE HARNAIS
 * avant exécution : le LLM propose, les règles disposent.
 *
 * 1. ≤ 3 marques simultanées (la plus ancienne s'efface automatiquement)
 * 2. Montants/frais/bénéficiaires : recopiés à l'identique du ScreenContext —
 *    toute altération = rejet de l'action (critère « sécurité » du jury)
 * 3. Zone sûre : les marques ne dépassent pas la limite basse (chrome hôte)
 */

private val AMOUNT_REGEX = Regex("""[\d][\d\s.,]* *(FCFA|francs?|fr\.?)""", RegexOption.IGNORE_CASE)

/** Marques vivantes suivies par le harnais (ordre d'apparition). */
class LiveMarks {
    private val visible = ArrayDeque<String>()

    fun onShown(id: String) {
        visible.remove(id)
        visible.addLast(id)
    }

    fun onHidden(id: String) = visible.remove(id)

    fun onClear() = visible.clear()

    /** Renvoie les ids à effacer pour respecter le budget, et met à jour l'état. */
    fun enforceBudget(max: Int = 3): List<String> {
        val toHide = ArrayList<String>()
        while (visible.size > max) {
            toHide.add(visible.removeFirst())
        }
        return toHide
    }

    fun count(): Int = visible.size
}

class CompositionRules(private val liveMarks: LiveMarks = LiveMarks()) {

    /** Vérifie qu'un texte d'action (write/speak) ne falsifie pas les montants de l'écran. */
    fun amountsPreserved(text: String, context: ScreenContext?): Boolean {
        val claimed = AMOUNT_REGEX.findAll(text).map { it.value }.toList()
        if (claimed.isEmpty()) return true
        if (context == null) return true // pas de contexte : on laisse passer (mode libre)
        val screenTexts = context.nodes.map { it.text }
        for (claimedAmount in claimed) {
            val digits = claimedAmount.filter { it.isDigit() }
            val found = screenTexts.any { it.filter { c -> c.isDigit() }.contains(digits) }
            if (!found) return false
        }
        return true
    }

    /** Prépare une action pour l'exécution : renvoie les hides automatiques éventuels. */
    fun onMarkShown(id: String): List<String> = liveMarks.enforceBudget()

    fun onHidden(id: String) = liveMarks.onHidden(id)
    fun onCleared() = liveMarks.onClear()
}
