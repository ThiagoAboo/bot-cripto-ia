import { forwardRef, type HTMLAttributes, type ImgHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

const Avatar = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function Avatar(
  { className, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-surface-muted)]',
        className,
      )}
      {...props}
    />
  )
})

Avatar.displayName = 'Avatar'

const AvatarImage = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  function AvatarImage({ className, alt = '', ...props }, ref) {
    return <img ref={ref} alt={alt} className={cn('h-full w-full object-cover', className)} {...props} />
  },
)

AvatarImage.displayName = 'AvatarImage'

const AvatarFallback = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function AvatarFallback({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        className={cn(
          'flex h-full w-full items-center justify-center bg-primary-600 text-sm font-semibold text-white',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

AvatarFallback.displayName = 'AvatarFallback'

export { Avatar, AvatarImage, AvatarFallback }
