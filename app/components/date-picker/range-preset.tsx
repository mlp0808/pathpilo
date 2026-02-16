'use client'

import { Button } from 'react-aria-components'

interface RangePresetButtonProps {
  value: { start: any; end: any }
  onClick: () => void
  children: React.ReactNode
}

export function RangePresetButton({ value, onClick, children }: RangePresetButtonProps) {
  return (
    <Button
      onPress={onClick}
      className="px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-accent-500"
    >
      {children}
    </Button>
  )
}
