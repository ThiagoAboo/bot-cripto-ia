import { forwardRef, HTMLAttributes } from 'react'
import { cn } from '../../../shared/utils/formatters'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'compact' | 'hover'
}

const Card = forwardRef<HTMLDivElement, CardProps>(({ children, className, variant = 'default', ...props }, ref) => {
  const variants = {
    default: 'rounded-3xl border p-6 shadow-sm',
    compact: 'rounded-2xl border p-4 shadow-sm',
    hover: 'rounded-3xl border p-6 shadow-sm transition-all duration-200 hover:border-primary-500/40 hover:shadow-lg',
  }

  return (
    <div
      ref={ref}
      className={cn(variants[variant], className)}
      style={{
        backgroundColor: 'var(--surface-1)',
        borderColor: 'var(--border-color)',
      }}
      {...props}
    >
      {children}
    </div>
  )
})

Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props} />
))
CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h3 ref={ref} className={cn('text-xl font-semibold leading-none tracking-tight', className)} style={{ color: 'var(--text-primary)' }} {...props} />
))
CardTitle.displayName = 'CardTitle'

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(({ className, ...props }, ref) => (
  <p ref={ref} className={cn('text-sm', className)} style={{ color: 'var(--text-secondary)' }} {...props} />
))
CardDescription.displayName = 'CardDescription'

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('', className)} {...props} />
))
CardContent.displayName = 'CardContent'

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('mt-4 flex items-center border-t pt-4', className)} style={{ borderColor: 'var(--border-color)' }} {...props} />
))
CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
