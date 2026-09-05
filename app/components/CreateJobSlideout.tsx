'use client'

import CreateJob from './CreateJob'

interface CreateJobSlideoutProps {
  isOpen: boolean
  onClose: () => void
  onJobCreated?: () => void
  clientId: number
  clientName: string
  /** Prefill the job date (e.g. from map location calendar selection). */
  initialDate?: string
  /** Prefill the assigned employee (e.g. from map nearby-route selection). */
  initialAssignedUserId?: number | null
}

/**
 * Thin wrapper around CreateJob that pre-selects and locks a specific client.
 * Used from the client detail page so the full CreateJob UI is shown but the
 * client cannot be changed.
 */
export default function CreateJobSlideout({
  isOpen,
  onClose,
  onJobCreated,
  clientId,
  initialDate,
  initialAssignedUserId,
}: CreateJobSlideoutProps) {
  return (
    <CreateJob
      isOpen={isOpen}
      onClose={onClose}
      onJobCreated={onJobCreated}
      initialClientId={clientId}
      lockClient={true}
      initialDate={initialDate}
      initialAssignedUserId={initialAssignedUserId}
    />
  )
}
