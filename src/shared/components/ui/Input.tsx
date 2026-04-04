import { forwardRef, InputHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(({ className, type, error, ...props }, ref) => {
  return (
    <div className="w-full">
      <input
        type={type}
        ref={ref}
        className={cn(
          'flex h-11 w-full rounded-2xl border px-3 py-2 text-sm outline-none ring-0 transition-all focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        style={{
          backgroundColor: 'var(--surface-2)',
          color: 'var(--text-primary)',
          borderColor: error ? '#ef4444' : 'var(--border-color)',
        }}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
})

Input.displayName = 'Input'

export { Input }
