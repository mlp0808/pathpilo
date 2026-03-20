'use client'

import CreateJob from './CreateJob'

interface CreateJobSlideoutProps {
  isOpen: boolean
  onClose: () => void
  onJobCreated?: () => void
  clientId: number
  clientName: string
}

/**
 * Thin wrapper around CreateJob that pre-selects and locks a specific client.
 * Used from the client detail page so the full CreateJob UI is shown but the
 * client cannot be changed.
 */
export default function CreateJobSlideout({ isOpen, onClose, onJobCreated, clientId }: CreateJobSlideoutProps) {
  return (
    <CreateJob
      isOpen={isOpen}
      onClose={onClose}
      onJobCreated={onJobCreated}
      initialClientId={clientId}
      lockClient={true}
    />
  )
}
