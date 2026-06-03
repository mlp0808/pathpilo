/** Small crown icon for Pro-only features in nav and upgrade prompts. */
export default function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M5 16 3 7l4.5 3L12 4l4.5 6L21 7l-2 9H5zm0 2h14v2H5v-2z" />
    </svg>
  )
}
