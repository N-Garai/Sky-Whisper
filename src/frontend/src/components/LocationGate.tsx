import { motion, AnimatePresence } from 'framer-motion';

interface LocationGateProps {
  open: boolean;
  denied: boolean;
  onShare: () => void;
  onManual: () => void;
  onDismiss: () => void;
}

/**
 * Center-screen location gate on first open.
 *
 * The browser's own permission bubble is small, silent, and easy to miss —
 * this explains WHY the site wants the fix (a narration of YOUR sky), so
 * the native prompt that follows feels expected instead of creepy.
 * "Enter manually" just closes the gate; the form keeps working.
 */
export function LocationGate({ open, denied, onShare, onManual, onDismiss }: LocationGateProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="loc-gate"
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm px-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="loc-gate-title"
        >
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="panel w-full max-w-md p-7 sm:p-8 text-center"
          >
            <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full border border-amber-300/25 bg-amber-300/10">
              <span className="text-2xl" aria-hidden="true">📍</span>
            </div>
            <h2 id="loc-gate-title" className="font-display text-xl sm:text-2xl text-white/90">
              Narrate Your Sky, Not Just Any Sky
            </h2>
            <p className="copy mt-3 text-sm leading-relaxed">
              SkyWhisper computes what is overhead <em className="text-white/75 not-italic font-medium">where you stand</em>.
              Share this device&rsquo;s location once and tonight&rsquo;s pack is built for your exact sky —
              otherwise it falls back to a default city.
            </p>
            {denied && (
              <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 px-3 py-2 text-xs text-red-200/90" role="alert">
                Location is blocked in this browser. Tap your address bar&rsquo;s lock icon to allow it,
                or just type coordinates below.
              </p>
            )}
            <div className="mt-6 space-y-2.5">
              <motion.button
                onClick={onShare}
                className="btn btn-primary w-full"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Use My Location
              </motion.button>
              <button
                onClick={onManual}
                className="w-full py-2.5 rounded-xl border border-white/15 text-white/60 text-sm hover:border-amber-400/40 hover:text-amber-300 transition-colors"
              >
                I&rsquo;ll Enter It Manually
              </button>
            </div>
            <button
              onClick={onDismiss}
              className="mt-3 text-xs text-white/30 hover:text-white/60 transition-colors"
            >
              Not now
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
