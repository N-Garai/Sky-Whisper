import { useEffect, useMemo, useRef, useState } from 'react';
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

/** Equalizer bars shown while the narration plays. */
const BAR_COUNT = 28;

function Equalizer({ playing }: { playing: boolean }) {
  if (!playing) return null;
  return (
    <div className="flex h-6 items-center gap-[3px]" aria-hidden="true">
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-amber-300/70"
          style={{ height: '100%', originY: 1 }}
          animate={{ scaleY: [0.18, 0.55 + Math.random() * 0.45, 0.22] }}
          transition={{
            duration: 0.7 + (i % 5) * 0.12,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.045,
          }}
        />
      ))}
    </div>
  );
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
  const [progress, setProgress] = useState(0);
  const offline = useOfflinePack();

  useMediaSession({
    title: packId ? `SkyWhisper — ${packId.slice(0, 8)}` : 'SkyWhisper',
    artist: 'SkyWhisper',
    album: "Tonight's sky",
    audioRef,
  });

  // Cache the pack on load so it survives airplane mode.
  useEffect(() => {
    if (packId) offline.download(packId, audioUrl, transcriptUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packId]);

  // Drive the progress ring from the audio element.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (audio.duration > 0) setProgress(audio.currentTime / audio.duration);
    };
    const onEnded = () => {
      setPlaying(false);
      setProgress(0);
    };
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const startPlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    // Screen-off countdown: breath-paced, then play.
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

  // Memoized: creating the object URL per render would hand the <audio>
  // element a new src every render and restart playback from zero.
  const playSrc = useMemo(
    () => (offline.audioBlob ? URL.createObjectURL(offline.audioBlob) : audioUrl),
    [offline.audioBlob, audioUrl],
  );

  useEffect(() => {
    return () => {
      if (playSrc !== null && playSrc.startsWith('blob:')) URL.revokeObjectURL(playSrc);
    };
  }, [playSrc]);

  const circumference = 2 * Math.PI * 56;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <audio
        ref={audioRef}
        src={playSrc ?? undefined}
        preload="auto"
        className="hidden"
      />

      {/* Screen-off countdown overlay */}
      <AnimatePresence>
        {countdown !== null && (
          <motion.div
            key="countdown"
            className="fixed inset-0 z-50 grid place-items-center bg-abyss"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.p
              key={countdown}
              className="num text-[7rem] font-light tabular-nums text-white/70"
              initial={{ opacity: 0.15, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {countdown}
            </motion.p>
            <p className="absolute bottom-16 font-mono text-[0.6rem] uppercase tracking-[0.3em] text-white/30">
              put the phone face-down
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Play control with progress ring */}
      {audioAvailable ? (
        <div className="relative grid place-items-center">
          {/* Progress ring */}
          <svg className="absolute h-32 w-32 -rotate-90" viewBox="0 0 128 128" aria-hidden="true">
            <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(231,236,247,0.1)" strokeWidth="2" />
            <circle
              cx="64"
              cy="64"
              r="56"
              fill="none"
              stroke="#F5C97B"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
            />
          </svg>

          {/* Halo */}
          {!playing && (
            <motion.span
              className="absolute h-24 w-24 rounded-full border border-amber-300/35"
              animate={{ scale: [1, 1.22, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          <motion.button
            onClick={playing ? togglePlay : startPlayback}
            className="relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-[#FFE7BC] via-amber-300 to-amber-deep text-[#1a1204]"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.96 }}
            aria-label={playing ? 'Pause narration' : 'Play narration'}
          >
            <span className="text-2xl font-bold" aria-hidden="true">
              {playing ? '❚❚' : '▶'}
            </span>
          </motion.button>
        </div>
      ) : (
        <div className="grid h-24 w-24 place-items-center rounded-full border border-white/15">
          <span className="text-2xl opacity-40" aria-hidden="true">
            📖
          </span>
        </div>
      )}

      {/* Status */}
      <div className="flex min-h-6 items-center justify-center gap-3">
        <Equalizer playing={playing} />
        <p className="text-center text-sm text-white/45">
          {audioAvailable ? (
            offline.status === 'cached'
              ? `offline ready · ${(offline.bytes / 1024 / 1024).toFixed(1)} MB cached`
              : offline.status === 'caching'
                ? 'caching for offline…'
                : 'preparing offline copy…'
          ) : (
            'audio is not configured on this server — the transcript below is your guide.'
          )}
        </p>
      </div>

      {/* Transcript */}
      <div className="panel w-full p-5 text-left">
        <p className="eyebrow mb-3 !text-white/35">tonight’s narration</p>
        <p className="copy whitespace-pre-line text-sm">{script}</p>
      </div>

      {/* Downloads */}
      <div className="flex flex-wrap justify-center gap-3">
        {audioUrl && (
          <a
            href={audioUrl}
            download="skywhisper-pack.mp3"
            className="btn btn-ghost !px-4 !py-2 !text-xs"
          >
            download audio
          </a>
        )}
        {transcriptUrl && (
          <a
            href={transcriptUrl}
            download="skywhisper-transcript.txt"
            className="btn btn-ghost !px-4 !py-2 !text-xs"
          >
            download transcript
          </a>
        )}
      </div>
    </div>
  );
}
