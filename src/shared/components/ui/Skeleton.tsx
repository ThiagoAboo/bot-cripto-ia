import { cn } from '../../../shared/utils/formatters'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular'
}

export function Skeleton({ className, variant = 'rectangular', ...props }: SkeletonProps) {
  const variants = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-2xl',
  }

  return <div className={cn('animate-pulse', variants[variant], className)} style={{ backgroundColor: 'var(--surface-3)' }} {...props} />
}
