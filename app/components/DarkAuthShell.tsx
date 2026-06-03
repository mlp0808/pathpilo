/**
 * Dark teal gradient shell shared by registration and setup wizard.
 * Matches the marketing site hero — without the dot grid overlay.
 */
export default function DarkAuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen min-h-[100dvh] overflow-x-hidden bg-[#0a1414]">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#0f2828] via-[#0a1818] to-[#050a0a]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-1/4 top-0 h-[min(600px,80vh)] w-[min(600px,80vw)] rounded-full bg-accent-500/15 blur-[120px]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-1/4 bottom-0 h-[min(440px,60vh)] w-[min(440px,70vw)] rounded-full bg-teal-600/10 blur-[110px]"
        aria-hidden
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
