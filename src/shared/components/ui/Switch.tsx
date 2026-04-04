import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(({ className, checked, onCheckedChange, ...props }, ref) => {
  return (
    <label className="relative inline-flex cursor-pointer items-center">
      <input
        type="checkbox"
        className="sr-only peer"
        ref={ref}
        checked={checked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        {...props}
      />
      <div
        className={cn('h-6 w-11 rounded-full border transition-all duration-200 peer-checked:border-primary-600 peer-checked:bg-primary-600', className)}
        style={{ backgroundColor: checked ? undefined : 'var(--surface-3)', borderColor: checked ? undefined : 'var(--border-color)' }}
      >
        <div
          className={cn('absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition-transform duration-200', checked && 'translate-x-5')}
        />
      </div>
    </label>
  )
})

Switch.displayName = 'Switch'

export { Switch }
