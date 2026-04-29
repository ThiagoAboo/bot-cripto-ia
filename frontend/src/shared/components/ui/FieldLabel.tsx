import { Label } from './Label'
import type { InfoPopoverContent } from './InfoPopover'
import { InfoPopover } from './InfoPopover'

interface FieldLabelProps {
  label: string
  htmlFor?: string
  help?: InfoPopoverContent
  disabled?: boolean
}

export function FieldLabel({ label, htmlFor, help, disabled = false }: FieldLabelProps) {
  return (
    <div className="flex items-center gap-2">
      <Label
        htmlFor={htmlFor}
        className={disabled ? 'text-[var(--color-text-muted)]' : undefined}
      >
        {label}
      </Label>
      {help && <InfoPopover content={help} />}
    </div>
  )
}
