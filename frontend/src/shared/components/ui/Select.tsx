import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../utils/formatters'

interface SelectContextType {
  open: boolean
  setOpen: (open: boolean) => void
  selectedValue: string
  setSelectedValue: (value: string) => void
}

const SelectContext = createContext<SelectContextType | undefined>(undefined)

interface SelectProps {
  children: ReactNode
  value: string
  onValueChange: (value: string) => void
}

export function Select({ children, value, onValueChange }: SelectProps) {
  const [open, setOpen] = useState(false)

  return (
    <SelectContext.Provider
      value={{
        open,
        setOpen,
        selectedValue: value,
        setSelectedValue: onValueChange,
      }}
    >
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  )
}

interface SelectTriggerProps {
  children: ReactNode
  className?: string
}

export function SelectTrigger({ children, className }: SelectTriggerProps) {
  const context = useContext(SelectContext)

  if (!context) {
    throw new Error('SelectTrigger must be used within Select')
  }

  const { open, setOpen } = context

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn('app-input flex h-11 w-full items-center justify-between rounded-xl px-3 text-sm shadow-sm', className)}
    >
      <span className="truncate">{children}</span>
      <ChevronDown className={cn('h-4 w-4 shrink-0 text-[var(--color-text-subtle)] transition-transform', open && 'rotate-180')} />
    </button>
  )
}

interface SelectValueProps {
  placeholder?: string
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const context = useContext(SelectContext)

  if (!context) {
    throw new Error('SelectValue must be used within Select')
  }

  const { selectedValue } = context

  return <span className={cn(selectedValue ? 'text-[var(--color-text)]' : 'text-[var(--color-text-subtle)]')}>{selectedValue || placeholder}</span>
}

interface SelectContentProps {
  children: ReactNode
  className?: string
}

export function SelectContent({ children, className }: SelectContentProps) {
  const context = useContext(SelectContext)
  const contentRef = useRef<HTMLDivElement | null>(null)

  if (!context) {
    throw new Error('SelectContent must be used within Select')
  }

  const { open, setOpen } = context

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, setOpen])

  if (!open) {
    return null
  }

  return (
    <div
      ref={contentRef}
      className={cn('absolute z-50 mt-2 max-h-72 w-full overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-2xl', className)}
    >
      {children}
    </div>
  )
}

interface SelectItemProps {
  children: ReactNode
  value: string
}

export function SelectItem({ children, value }: SelectItemProps) {
  const context = useContext(SelectContext)

  if (!context) {
    throw new Error('SelectItem must be used within Select')
  }

  const { selectedValue, setSelectedValue, setOpen } = context
  const isSelected = selectedValue === value

  return (
    <button
      type="button"
      onClick={() => {
        setSelectedValue(value)
        setOpen(false)
      }}
      className={cn(
        'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors',
        isSelected ? 'bg-primary-500/10 text-primary-600' : 'text-[var(--color-text)] hover:bg-[var(--color-surface-muted)]',
      )}
    >
      <span>{children}</span>
      {isSelected && <Check className="h-4 w-4" />}
    </button>
  )
}
