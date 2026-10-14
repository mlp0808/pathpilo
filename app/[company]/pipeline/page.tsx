'use client'

import { Suspense } from 'react'
import PipelineView from '@/app/components/pipeline/PipelineView'

export default function PipelinePage() {
  return (
    <Suspense fallback={null}>
      <PipelineView />
    </Suspense>
  )
}
