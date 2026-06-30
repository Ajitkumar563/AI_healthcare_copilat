"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, VolumeX } from "lucide-react";

interface Props {
  isListening:    boolean;
  isSpeaking:     boolean;
  isSupported:    boolean;
  onStart:        () => void;
  onStop:         () => void;
  onStopSpeaking: () => void;
  disabled?:      boolean;
  /** "sm" = 36 px, "md" = 44 px (default) */
  size?:          "sm" | "md";
  className?:     string;
}

const SIZES = {
  sm: { btn: "w-9 h-9",   icon: 15, ringBase: 36 },
  md: { btn: "w-11 h-11", icon: 18, ringBase: 44 },
};

// Three concentric rings that expand outward while listening
const LISTEN_RINGS  = [0, 1, 2] as const;
// Two rings while speaking (calmer rhythm)
const SPEAK_RINGS   = [0, 1]    as const;

export function VoiceInput({
  isListening,
  isSpeaking,
  isSupported,
  onStart,
  onStop,
  onStopSpeaking,
  disabled  = false,
  size      = "md",
  className = "",
}: Props) {
  // Hide entirely on unsupported browsers — no empty gap in UI
  if (!isSupported) return null;

  const { btn, icon, ringBase } = SIZES[size];
  const isActive = isListening || isSpeaking;

  const handleClick = () => {
    if (disabled) return;
    if (isSpeaking)    return onStopSpeaking();
    if (isListening)   return onStop();
    onStart();
  };

  const ariaLabel =
    isSpeaking  ? "Stop AI from speaking" :
    isListening ? "Stop recording" :
                  "Tap to speak your symptoms";

  const tooltip =
    isSpeaking  ? "Tap to stop" :
    isListening ? "Tap to stop recording" :
                  "Tap to speak";

  return (
    <div className={`relative flex flex-col items-center ${className}`}>
      {/* ── Pulse rings ────────────────────────────────────────────────────── */}
      <div className="relative flex items-center justify-center">
        <AnimatePresence>
          {isListening &&
            LISTEN_RINGS.map((i) => (
              <motion.span
                key={`listen-ring-${i}`}
                className="absolute rounded-full border border-red-400/60 pointer-events-none"
                style={{ width: ringBase, height: ringBase }}
                initial={{ scale: 1, opacity: 0.7 }}
                animate={{ scale: 1 + (i + 1) * 0.55, opacity: 0 }}
                transition={{
                  duration:  1.6,
                  delay:     i * 0.42,
                  repeat:    Infinity,
                  ease:      "easeOut",
                }}
              />
            ))}

          {isSpeaking &&
            SPEAK_RINGS.map((i) => (
              <motion.span
                key={`speak-ring-${i}`}
                className="absolute rounded-full border border-blue-400/60 pointer-events-none"
                style={{ width: ringBase, height: ringBase }}
                initial={{ scale: 1, opacity: 0.65 }}
                animate={{ scale: 1 + (i + 1) * 0.48, opacity: 0 }}
                transition={{
                  duration:  1.3,
                  delay:     i * 0.52,
                  repeat:    Infinity,
                  ease:      "easeOut",
                }}
              />
            ))}
        </AnimatePresence>

        {/* ── Button ───────────────────────────────────────────────────────── */}
        <motion.button
          type="button"
          whileTap={disabled ? {} : { scale: 0.9 }}
          onClick={handleClick}
          disabled={disabled}
          aria-label={ariaLabel}
          title={tooltip}
          className={[
            "relative z-10 rounded-full flex items-center justify-center",
            "shadow-md transition-colors duration-200",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
            btn,
            isSpeaking
              ? "bg-blue-500 hover:bg-blue-600 focus-visible:ring-blue-400"
              : isListening
                ? "bg-red-500 hover:bg-red-600 focus-visible:ring-red-400"
                : "bg-[var(--teal)] hover:bg-[var(--teal-light)] focus-visible:ring-[var(--teal)]",
            disabled
              ? "opacity-40 cursor-not-allowed"
              : "cursor-pointer",
          ].join(" ")}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isSpeaking ? (
              <motion.span
                key="icon-speaking"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1,   opacity: 1 }}
                exit={{   scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <VolumeX size={icon} className="text-white" />
              </motion.span>
            ) : isListening ? (
              <motion.span
                key="icon-listening"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1,   opacity: 1 }}
                exit={{   scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <MicOff size={icon} className="text-white" />
              </motion.span>
            ) : (
              <motion.span
                key="icon-idle"
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1,   opacity: 1 }}
                exit={{   scale: 0.5, opacity: 0 }}
                transition={{ duration: 0.14 }}
              >
                <Mic size={icon} className="text-white" />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* ── Status label (visible only while active) ────────────────────── */}
      <AnimatePresence>
        {isActive && (
          <motion.span
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0  }}
            exit={{   opacity: 0, y: -3  }}
            transition={{ duration: 0.18 }}
            className={[
              "mt-1.5 text-[10px] font-semibold tracking-wide whitespace-nowrap leading-none",
              isSpeaking ? "text-blue-500" : "text-red-500",
            ].join(" ")}
          >
            {isSpeaking ? "Speaking…" : "Listening…"}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}
