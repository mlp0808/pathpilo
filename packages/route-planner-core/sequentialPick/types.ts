/** Shared types for click-to-order selection (route draw, future pickers). */

export type SequentialPickId = number | string

export interface SequentialPickItem {
  id: SequentialPickId
}

export interface SequentialPickState {
  active: boolean
  order: SequentialPickId[]
}

export interface SequentialPickActions {
  start: () => void
  exit: () => void
  reset: () => void
  assign: (id: SequentialPickId) => void
  toggle: (id: SequentialPickId) => void
}

export interface SequentialPickMeta {
  /** 1-based position in the pick order, or null if not picked yet. */
  pickNumber: number | null
  /** True when this item can still be clicked to receive the next number. */
  pickAvailable: boolean
  /** True when this item has been assigned a number. */
  isPicked: boolean
  /** Number shown on hover before click (next in sequence). */
  previewNumber: number | null
}
