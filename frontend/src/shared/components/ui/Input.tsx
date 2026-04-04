import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string
}

const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type = 'text', error, ...props },
  ref,
) {
  return (
    <div className="w-full">
      <input
        ref={ref}
        type={type}
        className={cn('app-input h-11 w-full rounded-xl px-3 text-sm shadow-sm', error && 'border-error focus:border-error', className)}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
})

Input.displayName = 'Input'

export { Input }
