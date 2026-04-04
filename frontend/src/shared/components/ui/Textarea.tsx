import { forwardRef, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../utils/formatters'

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, error, ...props },
  ref,
) {
  return (
    <div className="w-full">
      <textarea
        ref={ref}
        className={cn(
          'app-input min-h-[120px] w-full rounded-xl px-3 py-2.5 text-sm shadow-sm',
          error && 'border-error focus:border-error',
          className,
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
})

Textarea.displayName = 'Textarea'

export { Textarea }
