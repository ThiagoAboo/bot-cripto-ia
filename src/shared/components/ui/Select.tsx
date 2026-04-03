import { createContext, useContext, useState, useRef, useEffect, ReactNode } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '../../utils/formatters'

interface SelectContextType {
  open: boolean
  setOpen: (open: boolean) => void
  value: string
  setValue: (value: string) => void
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
    <SelectContext.Provider value={{ open, setOpen, value, setValue: onValueChange }}>
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
  if (!context) throw new Error('SelectTrigger must be used within Select')

  const { open, setOpen, value } = context

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-lg border border-dark-300 bg-dark-300 px-3 py-2 text-sm text-white',
        'focus:outline-none focus:ring-2 focus:ring-primary-500',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
    >
      {children}
      <ChevronDown className={cn('h-4 w-4 opacity-50 transition-transform', open && 'rotate-180')} />
    </button>
  )
}

interface SelectValueProps {
  placeholder?: string
}

export function SelectValue({ placeholder }: SelectValueProps) {
  const context = useContext(SelectContext)
  if (!context) throw new Error('SelectValue must be used within Select')

  const { value } = context

  return <span className={cn(!value && 'text-gray-500')}>{value || placeholder}</span>
}

interface SelectContentProps {
  children: ReactNode
  className?: string
}

export function SelectContent({ children, className }: SelectContentProps) {
  const context = useContext(SelectContext)
  if (!context) throw new Error('SelectContent must be used within Select')

  const { open, setOpen } = context
  const contentRef = useRef<HTMLDivElement>(null)

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

  if (!open) return null

  return (
    <div
      ref={contentRef}
      className={cn(
        'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-dark-300 bg-dark-200 py-1 shadow-lg',
        className
      )}
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
  if (!context) throw new Error('SelectItem must be used within Select')

  const { value: selectedValue, setValue, setOpen } = context
  const isSelected = selectedValue === value

  return (
    <button
      type="button"
      onClick={() => {
        setValue(value)
        setOpen(false)
      }}
      className={cn(
        'relative flex w-full cursor-pointer select-none items-center justify-between px-3 py-2 text-sm text-white',
        'hover:bg-dark-300 transition-colors',
        isSelected && 'bg-primary-500/20 text-primary-400'
      )}
    >
      <span>{children}</span>
      {isSelected && <Check className="h-4 w-4" />}
    </button>
  )
}