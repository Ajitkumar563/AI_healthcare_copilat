"use client";

import { useState, useCallback, useRef, useEffect } from "react";

// Maps app language codes → Web Speech API BCP-47 tags
export const VOICE_LANG_MAP: Record<string, string> = {
  en:       "en-IN",
  hi:       "hi-IN",
  hinglish: "hi-IN",
  ar:       "ar-SA",
  fr:       "fr-FR",
  es:       "es-ES",
};

export type VoiceState = "idle" | "listening" | "speaking" | "error";

export interface UseVoiceReturn {
  transcript:     string;
  isListening:    boolean;
  isSpeaking:     boolean;
  isSupported:    boolean;
  voiceState:     VoiceState;
  error:          string | null;
  startListening: (lang?: string) => void;
  stopListening:  () => void;
  speak:          (text: string, lang?: string) => void;
  stopSpeaking:   () => void;
  clearTranscript: () => void;
}

export function useVoice(): UseVoiceReturn {
  const [transcript, setTranscript] = useState("");
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [error, setError]           = useState<string | null>(null);

  const recRef      = useRef<SpeechRecognition | null>(null);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recRef.current?.abort();
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    };
  }, []);

  const isSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  // ─── Speech-to-text ────────────────────────────────────────────────────────

  const startListening = useCallback(
    (lang = "en-IN") => {
      if (!isSupported) {
        setError("Voice input is not supported in this browser. Try Chrome or Edge.");
        setVoiceState("error");
        return;
      }

      // Cancel any TTS currently playing
      window.speechSynthesis.cancel();
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);

      const SR =
        (window as any).SpeechRecognition ??
        (window as any).webkitSpeechRecognition;

      const rec: SpeechRecognition = new SR();
      rec.lang             = lang;
      rec.continuous       = false;
      rec.interimResults   = true;
      rec.maxAlternatives  = 1;

      rec.onstart = () => {
        setVoiceState("listening");
        setError(null);
        setTranscript("");
      };

      rec.onresult = (e: SpeechRecognitionEvent) => {
        let finalText   = "";
        let interimText = "";

        for (let i = e.resultIndex; i < e.results.length; i++) {
          const chunk = e.results[i][0].transcript;
          if (e.results[i].isFinal) {
            finalText += chunk;
          } else {
            interimText += chunk;
          }
        }

        // Prefer final; fall back to interim so the textarea updates live
        setTranscript(finalText || interimText);
      };

      rec.onerror = (e: SpeechRecognitionErrorEvent) => {
        const msg: Record<string, string> = {
          "no-speech":     "No speech detected. Please try again.",
          "not-allowed":   "Microphone access denied. Allow microphone access in your browser settings.",
          "network":       "Network error during voice input. Please check your connection.",
          "audio-capture": "No microphone found. Please connect a microphone and try again.",
          "aborted":       "",
        };
        const text = msg[e.error] ?? "Voice input failed. Please try again.";
        if (text) setError(text);
        setVoiceState(text ? "error" : "idle");
      };

      rec.onend = () => {
        setVoiceState((prev) => (prev === "listening" ? "idle" : prev));
        recRef.current = null;
      };

      recRef.current = rec;
      try {
        rec.start();
      } catch {
        setError("Could not start microphone. Please try again.");
        setVoiceState("error");
      }
    },
    [isSupported]
  );

  const stopListening = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setVoiceState("idle");
  }, []);

  // ─── Text-to-speech ────────────────────────────────────────────────────────

  const speak = useCallback((text: string, lang = "en-IN") => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    if (keepAliveRef.current) clearInterval(keepAliveRef.current);

    // Strip markdown so it sounds natural when read aloud
    const clean = text
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/`/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ", ")
      .replace(/\s{2,}/g, " ")
      .trim();

    if (!clean) return;

    const utt    = new SpeechSynthesisUtterance(clean);
    utt.lang     = lang;
    utt.rate     = 0.88;
    utt.pitch    = 1.05;
    utt.volume   = 1;

    const cleanup = () => {
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      setVoiceState("idle");
    };

    utt.onstart = () => setVoiceState("speaking");
    utt.onend   = cleanup;
    utt.onerror = cleanup;

    window.speechSynthesis.speak(utt);

    // Chrome bug: SpeechSynthesis pauses silently on long text.
    // Calling pause()+resume() every 10 s keeps it alive.
    keepAliveRef.current = setInterval(() => {
      if (!window.speechSynthesis.speaking) {
        if (keepAliveRef.current) clearInterval(keepAliveRef.current);
        return;
      }
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 10_000);
  }, []);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis.cancel();
    if (keepAliveRef.current) clearInterval(keepAliveRef.current);
    setVoiceState("idle");
  }, []);

  const clearTranscript = useCallback(() => setTranscript(""), []);

  return {
    transcript,
    isListening:  voiceState === "listening",
    isSpeaking:   voiceState === "speaking",
    isSupported,
    voiceState,
    error,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    clearTranscript,
  };
}
