/** Logo LogisticAI: due container impilati e un punto arancio, la destinazione. */
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#3B5BFD" />
      <rect x="9" y="18" width="15" height="12" rx="3.5" fill="#fff" opacity=".55" />
      <rect x="16" y="10" width="15" height="12" rx="3.5" fill="#fff" />
      <circle cx="29" cy="29" r="3.5" fill="#FF7A1A" />
    </svg>
  );
}

export function Logo({ size = 32, inverse = false }: { size?: number; inverse?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-lg font-bold tracking-tight ${inverse ? 'text-white' : 'text-testo'}`}>LogisticAI</span>
    </span>
  );
}
