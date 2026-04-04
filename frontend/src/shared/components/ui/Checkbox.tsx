import { forwardRef, InputHTMLAttributes } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../utils/formatters'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string
}

const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(({ className, label, checked, onChange, ...props }, ref) => {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={onChange} ref={ref} {...props} />
        <div
          className={cn('flex h-4 w-4 items-center justify-center rounded border transition-all', checked && 'border-primary-500 bg-primary-500', className)}
          style={checked ? undefined : { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)' }}
        >
          {checked && <Check className="h-3 w-3 text-white" />}
        </div>
      </div>
      {label && <span style={{ color: 'var(--text-secondary)' }}>{label}</span>}
    </label>
  )
})

Checkbox.displayName = 'Checkbox'

export { Checkbox }
