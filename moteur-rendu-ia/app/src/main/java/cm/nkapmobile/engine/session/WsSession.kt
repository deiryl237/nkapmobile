package cm.nkapmobile.engine.session

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import cm.nkapmobile.engine.Engine
import cm.nkapmobile.engine.core.ScreenContext
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/**
 * I1/I3 côté appareil : session WebSocket du contrat (docs/02 §1).
 * hello → screen_context (à chaque écran) → ask(audio) → action* → turn_end.
 *
 * v1 : clips push-to-talk (audio_end → serveur). Le streaming continu = v2,
 * les trames ne changent pas.
 */
class WsSession(private val context: Context) {

    private val client = OkHttpClient.Builder()
        .pingInterval(20, TimeUnit.SECONDS)
        .connectTimeout(8, TimeUnit.SECONDS)
        .build()
    private var ws: WebSocket? = null
    private var sessionId: String? = null
    private var turnId: String? = null

    @Volatile private var recording = false
    private var recordThread: Thread? = null

    fun connect() {
        val url = serverUrl()
        val req = Request.Builder().url(url).build()
        ws = client.newWebSocket(req, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                send(JSONObject().put("type", "hello").put("protocol", 2)
                    .put("device", JSONObject().put("model", android.os.Build.MODEL).put("app", "nkap-engine"))
                    .put("capabilities", JSONObject().put("bank_pack_version", 1)).toString())
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handle(text)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                android.util.Log.w("nkapengine", "WS échec: ${t.message} — repli offline")
            }
        })
    }

    fun close() {
        ws?.close(1000, "bye")
        ws = null
    }

    fun sendContext(ctx: ScreenContext) {
        ws?.send(Engine.contextJson(ctx).put("session_id", sessionId ?: "").toString())
    }

    fun send(text: String) { ws?.send(text) }

    /** Démarre/arrête l'enregistrement micro et déclenche un tour. */
    fun toggleRecording() {
        if (recording) {
            recording = false
        } else {
            startRecording()
        }
    }

    private fun startRecording() {
        recording = true
        turnId = "t_${UUID.randomUUID().toString().take(8)}"
        recordThread = Thread {
            val sampleRate = 16000
            val minBuf = AudioRecord.getMinBufferSize(
                sampleRate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
            )
            val recorder = AudioRecord(
                MediaRecorder.AudioSource.MIC, sampleRate,
                AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minBuf * 4
            )
            val buffer = ShortArray(2048)
            val pcm = ArrayList<Byte>(sampleRate * 10)
            recorder.startRecording()
            while (recording) {
                val n = recorder.read(buffer, 0, buffer.size)
                for (i in 0 until n) {
                    pcm.add((buffer[i].toInt() and 0xFF).toByte())
                    pcm.add((buffer[i].toInt() shr 8).toByte())
                }
                if (pcm.size > sampleRate * 2 * 12) break // garde-fou 12 s
            }
            recorder.stop(); recorder.release()

            // trame binaire du contrat : le serveur assemble et transcrit (I1)
            val b64 = android.util.Base64.encodeToString(pcm.toByteArray(), android.util.Base64.NO_WRAP)
            ws?.send(
                JSONObject()
                    .put("type", "ask")
                    .put("turn_id", turnId ?: "")
                    .put("audio_b64", b64)
                    .put("audio_format", "pcm16le-16k")
                    .toString()
            )
        }.also { it.start() }
    }

    private fun handle(text: String) {
        val msg = try { JSONObject(text) } catch (e: Exception) { return }
        when (msg.optString("type")) {
            "hello_ack" -> sessionId = msg.optString("session_id")
            "transcript" -> {
                // le cerveau confirme ce qu'il a compris — affiché en caption
                val t = msg.optString("text")
                Engine.renderer?.showCaption("▶ $t")
            }
            "action" -> {
                val a = msg.optJSONObject("action") ?: return
                val parsed = cm.nkapmobile.engine.core.ActionStreamParser.parseAction(a) ?: return
                Engine.execute(
                    cm.nkapmobile.engine.core.TimedAction(
                        seq = msg.optInt("seq", 0),
                        speakSeg = if (msg.has("speak_seg")) msg.getInt("speak_seg") else null,
                        runAfterMs = msg.optInt("run_after_ms", 0),
                        action = parsed,
                    )
                )
            }
            "turn_end" -> { /* fin de tour */ }
            "error" -> Engine.renderer?.showCaption("⚠ ${msg.optJSONObject("error")?.optString("message") ?: "erreur"}")
        }
    }

    private fun serverUrl(): String {
        val prefs = context.getSharedPreferences("nkap", Context.MODE_PRIVATE)
        return prefs.getString("ws_url", "ws://10.0.2.2:9000/ws") ?: "ws://10.0.2.2:9000/ws"
    }
}
