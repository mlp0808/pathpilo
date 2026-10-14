'use client'

import { Suspense } from 'react'
import PipelineView from '@/app/components/pipeline/PipelineView'

export default function LeadsPage() {
  return (
    <Suspense fallback={null}>
      <PipelineView initialStage="lead" legacyKind="lead" />
    </Suspense>
  )
}
