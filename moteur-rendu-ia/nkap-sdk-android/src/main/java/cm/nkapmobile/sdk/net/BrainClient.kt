package cm.nkapmobile.sdk.net

import cm.nkapmobile.sdk.core.ActionProtocol
import cm.nkapmobile.sdk.core.FollowUpGoal
import cm.nkapmobile.sdk.core.ScreenContext
import cm.nkapmobile.sdk.core.TimedAction
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class HealthInfo(
    val ok: Boolean,
    val model: String = "",
    val latencyMs: Long = 0,
    val error: String? = null,
)

/**
 * Client HTTP M2 : communique avec POST {brainUrl}/answer et GET {brainUrl}/health.
 * Strictement le même contrat que l'extension Chrome (docs/02 v1.2).
 */
class BrainClient(var brainUrl: String) {

    private val client = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(25, TimeUnit.SECONDS)
        .writeTimeout(10, TimeUnit.SECONDS)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    private fun baseUrl(): String = brainUrl.trim().trimEnd('/')

    fun checkHealth(callback: (HealthInfo) -> Unit) {
        val base = baseUrl()
        if (base.isEmpty()) {
            callback(HealthInfo(ok = false, error = "URL vide"))
            return
        }
        Thread {
            val t0 = System.currentTimeMillis()
            val info = runCatching {
                val req = Request.Builder().url("$base/health").get().build()
                client.newCall(req).execute().use { resp ->
                    val ms = System.currentTimeMillis() - t0
                    if (!resp.isSuccessful) {
                        HealthInfo(ok = false, latencyMs = ms, error = "HTTP ${resp.code}")
                    } else {
                        val body = resp.body?.string().orEmpty()
                        val j = runCatching { JSONObject(body) }.getOrNull()
                        val model = j?.optJSONObject("llm")?.optString("ollama_model").orEmpty().ifBlank { "m2" }
                        HealthInfo(ok = true, model = model, latencyMs = ms)
                    }
                }
            }.getOrElse { e ->
                HealthInfo(ok = false, error = e.message ?: "Injoignable")
            }
            callback(info)
        }.start()
    }

    fun ask(
        question: String,
        context: ScreenContext,
        langHint: String = "fr",
        onResult: (List<TimedAction>) -> Unit,
        onError: (String) -> Unit,
        onFollowUp: ((FollowUpGoal?) -> Unit)? = null,
    ) {
        val base = baseUrl()
        if (base.isEmpty()) {
            onError("Serveur cerveau non configuré")
            return
        }
        Thread {
            try {
                val payload = JSONObject()
                    .put("channel", context.channel)
                    .put("transcript", question)
                    .put("lang_hint", langHint)
                    .put("context", context.toAnswerContextJson())

                val req = Request.Builder()
                    .url("$base/answer")
                    .post(payload.toString().toRequestBody(jsonType))
                    .build()

                client.newCall(req).execute().use { resp ->
                    val body = resp.body?.string().orEmpty()
                    android.util.Log.i("NkapSDK", "POST /answer HTTP ${resp.code} (${body.length} bytes)")
                    if (!resp.isSuccessful) {
                        android.util.Log.w("NkapSDK", "Error body: ${body.take(300)}")
                        onError("HTTP ${resp.code}")
                        return@Thread
                    }
                    val bundle = ActionProtocol.parseAnswerBundle(body)
                    android.util.Log.i("NkapSDK", "Parsed ${bundle.actions.size} actions (followUp=${bundle.followUp != null})")
                    onFollowUp?.invoke(bundle.followUp)
                    onResult(bundle.actions)
                }
            } catch (e: Exception) {
                onError(e.message ?: "Erreur réseau")
            }
        }.start()
    }
}
