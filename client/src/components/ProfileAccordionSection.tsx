import { ChevronDown } from 'lucide-react'
import type { ReactNode } from 'react'

interface ProfileAccordionSectionProps {
  id: string
  title: string
  icon?: ReactNode
  defaultOpen?: boolean
  /** When set, forces the section open (e.g. during onboarding tour). */
  forceOpen?: boolean
  children: ReactNode
}

export default function ProfileAccordionSection({
  id,
  title,
  icon,
  defaultOpen = false,
  forceOpen,
  children
}: ProfileAccordionSectionProps) {
  const isOpen = forceOpen !== undefined ? forceOpen : defaultOpen

  return (
    <details className="profile-accordion" open={isOpen || undefined} data-section={id}>
      <summary className="profile-accordion__summary">
        <span className="profile-accordion__title">
          {icon}
          <span>{title}</span>
        </span>
        <ChevronDown size={20} className="profile-accordion__chevron" aria-hidden="true" />
      </summary>
      <div className="profile-accordion__body">{children}</div>
    </details>
  )
}
