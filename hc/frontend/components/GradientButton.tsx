"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

interface GradientButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  variant?: "gradient" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export default function GradientButton({
  children,
  onClick,
  type = "button",
  loading = false,
  disabled = false,
  className = "",
  variant = "gradient",
  size = "md",
}: GradientButtonProps) {
  const sizeClass = size === "sm" ? "px-4 py-2 text-sm" : size === "lg" ? "px-8 py-4 text-base" : "px-5 py-2.5 text-sm";
  const variantClass =
    variant === "outline"
      ? "border-2 border-[var(--primary)] text-[var(--primary)] bg-transparent hover:bg-[var(--primary)]/5"
      : variant === "ghost"
      ? "text-[var(--primary)] bg-transparent hover:bg-[var(--primary)]/5"
      : "gradient-btn";

  return (
    <motion.button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      whileTap={!disabled && !loading ? { scale: 0.97 } : undefined}
      className={`rounded-xl font-semibold flex items-center justify-center gap-2 transition-all ${sizeClass} ${variantClass} ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </motion.button>
  );
}
