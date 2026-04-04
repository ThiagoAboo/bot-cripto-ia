import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'success' | 'warning' | 'error' | 'default'
}

const Badge = forwardRef<HTMLDivElement, BadgeProps>(({ className, variant = 'default', children, ...props }, ref) => {
  const variants = {
    default: 'border',
    primary: 'border border-primary-500/30 bg-primary-500/10 text-primary-500',
    success: 'border border-success/30 bg-success/10 text-success',
    warning: 'border border-warning/30 bg-warning/10 text-warning',
    error: 'border border-error/30 bg-error/10 text-error',
  }

  return (
    <div
      ref={ref}
      className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', variants[variant], className)}
      style={variant === 'default' ? { backgroundColor: 'var(--surface-2)', borderColor: 'var(--border-color)', color: 'var(--text-secondary)' } : undefined}
      {...props}
    >
      {children}
    </div>
  )
})

Badge.displayName = 'Badge'

export { Badge }
