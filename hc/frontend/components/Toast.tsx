"use client";

import { useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, X, Info } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const addToast = useCallback((message: string, type: ToastType = "success") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, toast: addToast, removeToast };
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

const STYLES = {
  success: "bg-white border-l-4 border-green-500",
  error: "bg-white border-l-4 border-red-500",
  info: "bg-white border-l-4 border-blue-500",
};

const ICON_STYLES = {
  success: "text-green-500",
  error: "text-red-500",
  info: "text-blue-500",
};

export function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: ToastItem[];
  onRemove: (id: string) => void;
}) {
  if (!toasts.length) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.type];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg pointer-events-auto ${STYLES[t.type]}`}
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${ICON_STYLES[t.type]}`} />
            <p className="text-sm text-gray-800 flex-1 leading-snug">{t.message}</p>
            <button
              onClick={() => onRemove(t.id)}
              className="text-gray-400 hover:text-gray-600 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
