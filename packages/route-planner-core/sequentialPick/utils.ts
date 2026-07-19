import type { SequentialPickId, SequentialPickMeta } from './types'

export function buildPickIndexMap(order: SequentialPickId[]): Map<string, number> {
  const m = new Map<string, number>()
  order.forEach((id, i) => m.set(String(id), i + 1))
  return m
}

export function getSequentialPickMeta(
  id: SequentialPickId,
  pickActive: boolean,
  pickOrder: SequentialPickId[],
  highlightedId: SequentialPickId | null | undefined,
): SequentialPickMeta {
  const index = buildPickIndexMap(pickOrder)
  const pickNumber = index.get(String(id)) ?? null
  const isPicked = pickNumber != null
  const pickAvailable = pickActive && !isPicked
  const nextNumber = pickOrder.length + 1
  const isHighlighted =
    highlightedId != null && String(highlightedId) === String(id)
  const previewNumber =
    pickAvailable && isHighlighted ? nextNumber : null

  return { pickNumber, pickAvailable, isPicked, previewNumber }
}
