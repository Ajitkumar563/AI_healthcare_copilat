interface RiskBadgeProps {
  level: string;
  size?: "sm" | "md";
  pulse?: boolean;
}

const CONFIG: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  low:      { bg: "bg-emerald-50 border border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", label: "Low" },
  medium:   { bg: "bg-amber-50 border border-amber-200",    text: "text-amber-700",   dot: "bg-amber-500",   label: "Medium" },
  high:     { bg: "bg-orange-50 border border-orange-200",  text: "text-orange-700",  dot: "bg-orange-500",  label: "High" },
  critical: { bg: "bg-red-50 border border-red-200",        text: "text-red-700",     dot: "bg-red-500",     label: "Critical" },
};

export default function RiskBadge({ level, size = "md", pulse = false }: RiskBadgeProps) {
  const key = level?.toLowerCase() || "low";
  const cfg = CONFIG[key] || CONFIG.low;
  const isCritical = key === "critical";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-semibold ${cfg.bg} ${cfg.text} ${
      size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
    }`}>
      <span className={`rounded-full shrink-0 ${cfg.dot} ${size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2"} ${
        (pulse || isCritical) ? "pulse-ring" : ""
      }`} />
      {cfg.label}
    </span>
  );
}
