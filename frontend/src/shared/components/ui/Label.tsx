import { forwardRef, type LabelHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {}

const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label({ className, children, ...props }, ref) {
  return (
    <label
      ref={ref}
      className={cn('mb-1.5 inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text-muted)]', className)}
      {...props}
    >
      {children}
    </label>
  )
})

Label.displayName = 'Label'

export { Label }
