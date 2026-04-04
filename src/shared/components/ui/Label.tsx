import { forwardRef, LabelHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, children, ...props }, ref) => (
  <label
    ref={ref}
    className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
    style={{ color: 'var(--text-secondary)' }}
    {...props}
  >
    {children}
  </label>
))

Label.displayName = 'Label'

export { Label }
