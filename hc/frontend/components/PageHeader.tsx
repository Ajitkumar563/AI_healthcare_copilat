interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  gradient?: string;
}

export default function PageHeader({
  title,
  subtitle,
  icon,
  gradient = "var(--gradient-hero)",
}: PageHeaderProps) {
  return (
    <div className="relative overflow-hidden" style={{ background: gradient }}>
      <div className="absolute inset-0 opacity-10">
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full bg-white/20" />
        <div className="absolute -bottom-12 -left-8 w-64 h-64 rounded-full bg-white/10" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-1">
          {icon && (
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white">
              {icon}
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{title}</h1>
        </div>
        {subtitle && <p className="text-white/75 text-sm mt-1 ml-0.5">{subtitle}</p>}
      </div>
      {/* Wave bottom */}
      <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 28" fill="none" preserveAspectRatio="none">
        <path d="M0 28L60 22.7C120 17.3 240 6.7 360 4.7C480 2.7 600 9.3 720 12C840 14.7 960 13.3 1080 11.3C1200 9.3 1320 6.7 1380 5.3L1440 4V28H0Z" fill="#F8FAFC"/>
      </svg>
      <div className="h-7" />
    </div>
  );
}
