import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

export interface ThemedSelectOption {
  value: string
  label: string
}

interface ThemedSelectProps {
  id?: string
  value: string
  options: ThemedSelectOption[]
  onChange: (value: string) => void
  disabled?: boolean
}

export default function ThemedSelect({
  id,
  value,
  options,
  onChange,
  disabled = false
}: ThemedSelectProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const selectOption = (nextValue: string) => {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className={`themed-select${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        type="button"
        id={id}
        className="themed-select-trigger input-text"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((current) => !current)}
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDown size={16} className="themed-select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul className="themed-select-menu" role="listbox" aria-labelledby={id}>
          {options.map((option) => (
            <li
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              className={`themed-select-option${option.value === value ? ' is-selected' : ''}`}
              onClick={() => selectOption(option.value)}
            >
              {option.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
