import { cn } from '../../../shared/utils/formatters'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular'
}

export function Skeleton({ className, variant = 'rectangular', ...props }: SkeletonProps) {
  const variants = {
    text: 'h-4 rounded-md',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
  } as const

  return <div className={cn('animate-pulse bg-[var(--color-surface-strong)]/80', variants[variant], className)} {...props} />
}
