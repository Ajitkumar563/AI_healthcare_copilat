"use client";

import { motion } from "framer-motion";

interface GradientCardProps {
  children: React.ReactNode;
  className?: string;
  topColor?: string;
  hover?: boolean;
  onClick?: () => void;
}

export default function GradientCard({
  children,
  className = "",
  topColor = "var(--gradient-hero)",
  hover = true,
  onClick,
}: GradientCardProps) {
  return (
    <motion.div
      whileHover={hover ? { y: -4, boxShadow: "0 8px 40px rgba(15,118,110,0.16)" } : undefined}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className={`bg-white rounded-2xl shadow-[var(--shadow-sm)] overflow-hidden ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      <div className="h-1 w-full" style={{ background: topColor }} />
      <div className="p-5">{children}</div>
    </motion.div>
  );
}
