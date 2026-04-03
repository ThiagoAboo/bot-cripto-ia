import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => {
    return (
      <label className="relative inline-flex items-center cursor-pointer">
        <input
          type="checkbox"
          className="sr-only peer"
          ref={ref}
          checked={checked}
          onChange={(e) => onCheckedChange?.(e.target.checked)}
          {...props}
        />
        <div
          className={cn(
            'w-11 h-6 bg-dark-400 rounded-full peer peer-checked:bg-primary-600',
            'peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500',
            'transition-all duration-200',
            className
          )}
        >
          <div
            className={cn(
              'absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200',
              checked && 'translate-x-5'
            )}
          />
        </div>
      </label>
    )
  }
)

Switch.displayName = 'Switch'

export { Switch }