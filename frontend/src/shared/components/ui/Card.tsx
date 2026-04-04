import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '../../../shared/utils/formatters'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'compact' | 'hover'
}

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { children, className, variant = 'default', ...props },
  ref,
) {
  const variants = {
    default: 'app-card rounded-3xl p-6',
    compact: 'app-card rounded-2xl p-4',
    hover: 'app-card rounded-3xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-500/35',
  } as const

  return (
    <div ref={ref} className={cn(variants[variant], className)} {...props}>
      {children}
    </div>
  )
})

Card.displayName = 'Card'

const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('mb-5 space-y-1.5', className)} {...props} />
})

CardHeader.displayName = 'CardHeader'

const CardTitle = forwardRef<HTMLHeadingElement, HTMLAttributes<HTMLHeadingElement>>(function CardTitle(
  { className, ...props },
  ref,
) {
  return <h3 ref={ref} className={cn('text-xl font-semibold text-[var(--color-text)]', className)} {...props} />
})

CardTitle.displayName = 'CardTitle'

const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <p ref={ref} className={cn('text-sm text-[var(--color-text-muted)]', className)} {...props} />
  },
)

CardDescription.displayName = 'CardDescription'

const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('space-y-4', className)} {...props} />
})

CardContent.displayName = 'CardContent'

const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div ref={ref} className={cn('mt-5 flex items-center gap-3', className)} {...props} />
})

CardFooter.displayName = 'CardFooter'

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter }
