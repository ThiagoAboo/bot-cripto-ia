import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { className, checked = false, onCheckedChange, onChange, ...props },
  ref,
) {
  return (
    <label className={cn('relative inline-flex cursor-pointer items-center', className)}>
      <input
        ref={ref}
        type="checkbox"
        className="sr-only"
        checked={!!checked}
        onChange={(event) => {
          onCheckedChange?.(event.target.checked)
          onChange?.(event)
        }}
        {...props}
      />
      <span
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full border transition-all',
          checked
            ? 'border-primary-600 bg-primary-600'
            : 'border-[var(--color-border-strong)] bg-[var(--color-surface-strong)]',
        )}
      >
        <span
          className={cn(
            'absolute h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </label>
  )
})

Switch.displayName = 'Switch'

export { Switch }
