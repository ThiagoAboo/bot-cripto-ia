import { useEffect, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { cn } from '../../utils/formatters'

export interface InfoPopoverContent {
  title: string
  description: string
  example?: string
}

interface InfoPopoverProps {
  content: InfoPopoverContent
  align?: 'left' | 'right'
  className?: string
}

export function InfoPopover({
  content,
  align = 'right',
  className,
}: InfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div ref={containerRef} className={cn('relative inline-flex', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] transition-colors hover:border-primary-500/40 hover:text-primary-400"
        aria-label={`Ajuda: ${content.title}`}
        aria-expanded={isOpen}
      >
        <Info className="h-3.5 w-3.5" />
      </button>

      {isOpen && (
        <div
          className={cn(
            'absolute top-full z-40 mt-2 w-72 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl',
            align === 'left' ? 'left-0' : 'right-0',
          )}
        >
          <p className="text-sm font-semibold text-[var(--color-text)]">{content.title}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">{content.description}</p>
          {content.example && (
            <div className="mt-3 rounded-xl bg-[var(--color-surface-muted)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
              <span className="font-medium text-[var(--color-text)]">Exemplo:</span> {content.example}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
