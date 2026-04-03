import { forwardRef, InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../utils/formatters'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, checked, onChange, ...props }, ref) => {
    return (
      <label className="flex items-center gap-2 cursor-pointer">
        <div className="relative">
          <input
            type="checkbox"
            className="sr-only"
            checked={checked}
            onChange={onChange}
            ref={ref}
            {...props}
          />
          <div
            className={cn(
              'w-4 h-4 rounded border transition-all',
              checked
                ? 'bg-primary-500 border-primary-500'
                : 'border-dark-400 bg-dark-300',
              className
            )}
          >
            {checked && <Check className="w-3 h-3 text-white absolute top-0.5 left-0.5" />}
          </div>
        </div>
        {label && <span className="text-sm text-gray-300">{label}</span>}
      </label>
    )
  }
)

Checkbox.displayName = 'Checkbox'

export { Checkbox }