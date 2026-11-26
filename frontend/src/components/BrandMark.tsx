export function BrandMark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 48 48"
      width="40"
      height="40"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="48" height="48" rx="14" fill="var(--primary)" />
      <path
        d="M12 14v20h10M23 34V14l7 11 7-11v20"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
