/** A simple geometric mark used for brand identity in the app. Swap freely. */
export function AppLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 110" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <defs>
        <linearGradient id="appFaceL" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a3a" />
          <stop offset="1" stopColor="#101010" />
        </linearGradient>
        <linearGradient id="appFaceR" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a8a8a" />
          <stop offset="1" stopColor="#4a4a4a" />
        </linearGradient>
        <linearGradient id="appFaceT" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f2f2f2" />
          <stop offset="1" stopColor="#bdbdbd" />
        </linearGradient>
      </defs>
      <path d="M50 5 7 30v50l43 25V55Z" fill="url(#appFaceL)" />
      <path d="M50 5 93 30v50L50 105V55Z" fill="url(#appFaceR)" />
      <path d="M50 5 7 30l43 25 43-25Z" fill="url(#appFaceT)" />
      <path d="M50 55 93 30v18L50 73Z" fill="#ffffff" opacity="0.12" />
    </svg>
  );
}
