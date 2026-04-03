import { createContext, useContext, useState, ReactNode } from 'react'
import { cn } from '../../utils/formatters'

interface TabsContextType {
  value: string
  setValue: (value: string) => void
}

const TabsContext = createContext<TabsContextType | undefined>(undefined)

interface TabsProps {
  defaultValue: string
  children: ReactNode
  className?: string
  onValueChange?: (value: string) => void
}

export function Tabs({ defaultValue, children, className, onValueChange }: TabsProps) {
  const [value, setValue] = useState(defaultValue)

  const handleValueChange = (newValue: string) => {
    setValue(newValue)
    onValueChange?.(newValue)
  }

  return (
    <TabsContext.Provider value={{ value, setValue: handleValueChange }}>
      <div className={cn('w-full', className)}>{children}</div>
    </TabsContext.Provider>
  )
}

interface TabsListProps {
  children: ReactNode
  className?: string
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div className={cn('flex gap-1 border-b border-dark-300', className)}>
      {children}
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabsTrigger({ value, children, className }: TabsTriggerProps) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsTrigger must be used within Tabs')

  const isActive = context.value === value

  return (
    <button
      onClick={() => context.setValue(value)}
      className={cn(
        'px-4 py-2 text-sm font-medium transition-all duration-200',
        'hover:text-white',
        isActive
          ? 'text-primary-400 border-b-2 border-primary-500'
          : 'text-gray-500 hover:text-gray-300',
        className
      )}
    >
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: ReactNode
  className?: string
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const context = useContext(TabsContext)
  if (!context) throw new Error('TabsContent must be used within Tabs')

  if (context.value !== value) return null

  return <div className={cn('mt-4', className)}>{children}</div>
}