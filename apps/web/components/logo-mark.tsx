export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" className={className} aria-hidden="true">
      <rect width="28" height="28" rx="9" fill="var(--primary)" />
      {/* Crescent formed by subtracting an offset circle from a base circle —
          evokes a cycle/phase mark (Vita = life-cycle) while doubling as a
          simple ascending-arc "V" reading, without any literal V glyph. */}
      <mask id="logo-crescent-mask">
        <rect width="28" height="28" fill="white" />
        <circle cx="16.5" cy="12.5" r="7" fill="black" />
      </mask>
      <circle cx="13" cy="14" r="7.5" fill="var(--primary-foreground)" mask="url(#logo-crescent-mask)" />
    </svg>
  );
}
