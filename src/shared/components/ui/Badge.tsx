import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'default'
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    const variants = {
      default: 'bg-dark-300 text-gray-300',
      primary: 'bg-primary-500/20 text-primary-400 border border-primary-500/30',
      success: 'bg-success/20 text-success border border-success/30',
      warning: 'bg-warning/20 text-warning border border-warning/30',
      error: 'bg-error/20 text-error border border-error/30',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
          variants[variant],
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

Badge.displayName = 'Badge'

export { Badge }