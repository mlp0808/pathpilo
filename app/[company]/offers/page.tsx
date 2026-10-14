'use client'

import { Suspense } from 'react'
import PipelineView from '@/app/components/pipeline/PipelineView'

export default function OffersPage() {
  return (
    <Suspense fallback={null}>
      <PipelineView initialStage="offer" legacyKind="offer" />
    </Suspense>
  )
}
