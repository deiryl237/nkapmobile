package cm.nkapmobile.sdk.core

/**
 * Règles d'or du harnais NkapSDK :
 * 1. <= 3 marques visuelles simultanées (la plus ancienne s'efface automatiquement).
 * 2. Intégrité financière : les montants affichés ne sont jamais altérés.
 */
class CompositionRules {
    private val visible = ArrayDeque<String>()

    fun onMarkShown(id: String, max: Int = 3): List<String> {
        visible.remove(id)
        visible.addLast(id)
        val evicted = ArrayList<String>()
        while (visible.size > max) {
            evicted.add(visible.removeFirst())
        }
        return evicted
    }

    fun onHidden(id: String) {
        visible.remove(id)
    }

    fun onCleared() {
        visible.clear()
    }
}
