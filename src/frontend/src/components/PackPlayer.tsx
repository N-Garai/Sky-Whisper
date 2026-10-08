import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMediaSession } from '../hooks/useMediaSession';
import { useOfflinePack } from '../hooks/useOfflinePack';

interface PackPlayerProps {
  audioUrl: string | null;
  transcriptUrl: string | null;
  script: string;
  packId: string | null;
  audioAvailable: boolean;
}

/**
 * The field page's only control. Plays cached audio with the screen off,
 * wires the lock screen via MediaSession, and runs the screen-off countdown
 * ritual before playback starts.
 */
export function PackPlayer({ audioUrl, transcriptUrl, script, packId, audioAvailable }: PackPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const offline = useOfflinePack();

  useMediaSession({
    title: packId ? `SkyWhisper — ${packId.slice(0, 8)}` : 'SkyWhisper',
    artist: 'SkyWhisper',
    album: "Tonight's sky",
    audioRef,
  });

  // Cache the pack on load so it survives airplane mode.
  useEffect(() => {
    if (packId) {
      offline.download(packId, audioUrl, transcriptUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  const startPlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Screen-off countdown: 5-4-3-2-1 breath-paced fade, then play.
    setCountdown(5);
    for (let n = 5; n >= 1; n--) {
      setCountdown(n);
      await new Promise((r) => setTimeout(r, 900));
    }
    setCountdown(null);

    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const playSrc = offline.audioBlob ? URL.createObjectURL(offline.audioBlob) : audioUrl;

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <audio
        ref={audioRef}
        src={playSrc ?? undefined}
        preload="auto"
        onEnded={() => setPlaying(false)}
        className="hidden"
      />

      {/* Screen-off countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            key="countdown"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.p
              key={countdown}
              className="text-white/70 text-7xl font-light tabular-nums"
              initial={{ opacity: 0.2, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            >
              {countdown}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {audioAvailable ? (
        <motion.button
          onClick={playing ? togglePlay : startPlayback}
          className="relative w-32 h-32 rounded-full bg-amber-500 text-black flex items-center justify-center shadow-2xl shadow-amber-500/30 cursor-pointer"
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          aria-label={playing ? 'Pause narration' : 'Play narration'}
        >
          <span className="text-4xl">{playing ? '❚❚' : '▶'}</span>
          {!playing && (
            <motion.span
              className="absolute inset-0 rounded-full border border-amber-400/40"
              animate={{ scale: [1, 1.12, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}
        </motion.button>
      ) : (
        <div className="w-32 h-32 rounded-full border border-white/15 flex items-center justify-center">
          <span className="text-3xl opacity-40">📖</span>
        </div>
      )}

      <div className="text-center space-y-1">
        {audioAvailable ? (
          <p className="text-white/40 text-sm">
            {offline.status === 'cached'
              ? `offline ready · ${(offline.bytes / 1024 / 1024).toFixed(1)} MB cached`
              : offline.status === 'caching'
                ? 'caching for offline…'
                : 'preparing offline copy…'}
          </p>
        ) : (
          <p className="text-white/40 text-sm">
            audio is not configured on this server — the transcript below is your guide.
          </p>
        )}
      </div>

      <div className="w-full text-left bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 backdrop-blur-sm">
        <p className="text-white/30 text-xs uppercase tracking-widest mb-3">tonight's narration</p>
        <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line">{script}</p>
      </div>

      <div className="flex gap-3 flex-wrap justify-center">
        {audioUrl && (
          <a
            href={audioUrl}
            download="skywhisper-pack.mp3"
            className="px-4 py-2 rounded-lg border border-white/15 text-white/50 text-xs hover:border-amber-400/40 hover:text-amber-300 transition-colors"
          >
            download audio
          </a>
        )}
        {transcriptUrl && (
          <a
            href={transcriptUrl}
            download="skywhisper-transcript.txt"
            className="px-4 py-2 rounded-lg border border-white/15 text-white/50 text-xs hover:border-amber-400/40 hover:text-amber-300 transition-colors"
          >
            download transcript
          </a>
        )}
      </div>
    </div>
  );
}
