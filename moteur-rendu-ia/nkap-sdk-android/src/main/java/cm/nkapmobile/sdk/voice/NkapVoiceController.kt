package cm.nkapmobile.sdk.voice

import android.content.Context
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.UUID

/**
 * Gestionnaire vocal séquentiel synchronisé (M3) :
 * - File d'attente sans coupure entre phrases d'un même tour
 * - Supporte les URL audio (banque Ewondo/Duálá) ET le TTS natif Android
 * - Remonte l'état `onSpeakingChanged(true/false)` en temps réel pour animer l'orbe Jarvis
 */
class NkapVoiceController(
    context: Context,
    private val onSpeakingChanged: (Boolean) -> Unit,
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val queue = ArrayDeque<Pair<String, String?>>() // (text, audioUrl)
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var player: MediaPlayer? = null
    private val pendingDoneCallbacks = ArrayList<() -> Unit>()

    @Volatile var audioEnabled: Boolean = true
    @Volatile var isSpeaking: Boolean = false
        private set

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                tts?.language = Locale.FRENCH
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String?) {
                        setSpeakingState(true)
                    }

                    override fun onDone(utteranceId: String?) {
                        mainHandler.post { finishCurrentItem() }
                    }

                    @Deprecated("Deprecated in Java")
                    override fun onError(utteranceId: String?) {
                        mainHandler.post { finishCurrentItem() }
                    }

                    override fun onError(utteranceId: String?, errorCode: Int) {
                        mainHandler.post { finishCurrentItem() }
                    }
                })
                if (queue.isNotEmpty() && !isSpeaking) {
                    mainHandler.post { processNext() }
                }
            }
        }
    }

    fun enqueue(text: String, audioUrl: String? = null) {
        if (!audioEnabled || text.isBlank()) return
        mainHandler.post {
            queue.addLast(Pair(text, audioUrl))
            if (!isSpeaking) processNext()
        }
    }

    fun onIdleOnce(cb: () -> Unit) {
        mainHandler.post {
            if (!isSpeaking && queue.isEmpty()) cb()
            else pendingDoneCallbacks.add(cb)
        }
    }

    fun stopAll() {
        mainHandler.post {
            queue.clear()
            pendingDoneCallbacks.clear()
            runCatching { tts?.stop() }
            runCatching { player?.stop(); player?.release() }
            player = null
            setSpeakingState(false)
        }
    }

    fun shutdown() {
        stopAll()
        runCatching { tts?.shutdown() }
        tts = null
        ttsReady = false
    }

    private fun setSpeakingState(speaking: Boolean) {
        if (isSpeaking != speaking) {
            isSpeaking = speaking
            mainHandler.post { onSpeakingChanged(speaking) }
        }
    }

    private fun processNext() {
        if (!audioEnabled || queue.isEmpty()) {
            setSpeakingState(false)
            val cbs = ArrayList(pendingDoneCallbacks)
            pendingDoneCallbacks.clear()
            cbs.forEach { runCatching { it() } }
            return
        }
        val (text, audioUrl) = queue.removeFirst()
        setSpeakingState(true)

        if (!audioUrl.isNullOrBlank()) {
            try {
                player?.release()
                player = MediaPlayer().apply {
                    setDataSource(audioUrl)
                    setOnPreparedListener { it.start() }
                    setOnCompletionListener {
                        it.release()
                        player = null
                        mainHandler.post { finishCurrentItem() }
                    }
                    setOnErrorListener { mp, _, _ ->
                        mp.release()
                        player = null
                        mainHandler.post { speakTts(text) }
                        true
                    }
                    prepareAsync()
                }
                return
            } catch (_: Exception) {
                // Repli TTS système
            }
        }
        speakTts(text)
    }

    private fun speakTts(text: String) {
        if (!ttsReady || tts == null) {
            // Repli minuterie si TTS pas encore prêt
            val estMs = (text.length * 65L).coerceIn(1800L, 8000L)
            mainHandler.postDelayed({ finishCurrentItem() }, estMs)
            return
        }
        val uttId = "nkap_${UUID.randomUUID().toString().take(8)}"
        val res = tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, uttId)
        if (res != TextToSpeech.SUCCESS) {
            finishCurrentItem()
        }
    }

    private fun finishCurrentItem() {
        if (queue.isNotEmpty()) {
            processNext()
        } else {
            setSpeakingState(false)
            val cbs = ArrayList(pendingDoneCallbacks)
            pendingDoneCallbacks.clear()
            cbs.forEach { runCatching { it() } }
        }
    }
}
