'use client'

import { useCallback, useMemo, useState } from 'react'
import type { SequentialPickId } from './types'
import { buildPickIndexMap } from './utils'

export interface UseSequentialPickOptions {
  /** Called when every id in `allIds` has been picked (in order). */
  onComplete?: (orderedIds: SequentialPickId[]) => void
}

export function useSequentialPick(
  allIds: SequentialPickId[],
  options?: UseSequentialPickOptions,
) {
  const [active, setActive] = useState(false)
  const [order, setOrder] = useState<SequentialPickId[]>([])

  const indexMap = useMemo(() => buildPickIndexMap(order), [order])
  const nextNumber = order.length + 1
  const isComplete =
    active && allIds.length > 0 && order.length >= allIds.length

  const start = useCallback(() => {
    setActive(true)
    setOrder([])
  }, [])

  const exit = useCallback(() => {
    setActive(false)
    setOrder([])
  }, [])

  const reset = useCallback(() => {
    setOrder([])
  }, [])

  const assign = useCallback(
    (id: SequentialPickId) => {
      if (!active) return
      const allowed = new Set(allIds.map(String))
      if (!allowed.has(String(id))) return

      setOrder(prev => {
        const idx = prev.findIndex(x => String(x) === String(id))
        if (idx !== -1) return prev.filter(x => String(x) !== String(id))

        const next = [...prev, id]
        if (next.length === allIds.length) {
          queueMicrotask(() => options?.onComplete?.(next))
        }
        return next
      })
    },
    [active, allIds, options],
  )

  const toggle = assign

  const getNumber = useCallback(
    (id: SequentialPickId) => indexMap.get(String(id)) ?? null,
    [indexMap],
  )

  return {
    active,
    order,
    nextNumber,
    isComplete,
    indexMap,
    start,
    exit,
    reset,
    assign,
    toggle,
    getNumber,
  }
}
