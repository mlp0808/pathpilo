/** Instruction line + optional curved arrow (setup wizard white panel) */
export function SetupWizardHintArrow() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 164.006 193.522"
      aria-hidden
      className="pointer-events-none absolute -right-1 top-0 z-30 h-14 w-auto text-accent-500 opacity-90 sm:h-16"
    >
      <path
        d="M170.837,25.842c-1.715,2.337-3.773,4.249-5.317,6.8-13.207,22.73-31.815,36.639-52.739,42.8a43.73,43.73,0,0,1-22.811,0c-21.1-5.1-34.428-16.574-51.065-33.569-4.8-4.886-10.056-13.692-13.486-20.7,1.886.85,3.944,1.7,5.832,2.762,5.488,2.974,10.977,6.161,16.637,8.71,2.4,1.062,5.317,1.062,8.062.85,1.029,0,2.572-1.912,2.744-3.187s-.858-3.611-1.715-3.824C42.4,20.956,29.706,10.335,16.5,1.2c-4.631-3.186-7.547-2.337-9.6,3.4A126.814,126.814,0,0,0,.034,49.422c0,.425.686,1.062,1.715,2.337,10.12-4.674,7.033-18.269,12.006-29.1,1.2,2.549,2.058,4.674,3.087,6.373,21.611,32.927,48.07,50.03,73.127,56.02,5.3,1.373,15.864,1.973,21.009.911,18.866-4.036,35.675-13.808,49.568-30.165,4.459-5.311,7.718-12.321,10.977-18.906,1.372-2.549,1.372-6.16,1.887-9.135Z"
        transform="translate(89.859 193.193) rotate(-121)"
        fill="currentColor"
      />
    </svg>
  )
}

export default function SetupWizardHint({
  children,
  showArrow = false,
}: {
  children: React.ReactNode
  showArrow?: boolean
}) {
  return (
    <div className="relative mb-4 pr-14 sm:pr-16">
      <p className="relative z-[1] text-base font-semibold text-gray-800 leading-snug">{children}</p>
      {showArrow && <SetupWizardHintArrow />}
    </div>
  )
}
