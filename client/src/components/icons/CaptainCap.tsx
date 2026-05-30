import type { SVGProps } from 'react'

interface CaptainCapProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

/** Skipper-/Kapitänsmütze im Lucide-Strichstil (nicht in lucide-react enthalten). */
export default function CaptainCap({ size = 24, ...props }: CaptainCapProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M5 11c0-3.5 3-6 7-6s7 2.5 7 6" />
      <path d="M4 11h16" />
      <path d="M4 11c0 2.5 3.2 4.5 8 4.5S20 13.5 20 11" />
      <path d="M8 11h8" />
    </svg>
  )
}
