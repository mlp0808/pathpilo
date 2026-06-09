'use client'

/** Work (green) vs drive (blue) split — used when daily capacity mode is off. */
export default function WorkDriveDayBar({
  jobMinutes,
  driveMinutes,
  className = 'h-2',
}: {
  jobMinutes: number
  driveMinutes: number
  className?: string
}) {
  const job = Math.max(0, jobMinutes)
  const drive = Math.max(0, driveMinutes)
  const total = job + drive

  if (total <= 0) {
    return (
      <div
        className={`w-full rounded-full bg-gray-100 ${className}`}
        title="No jobs scheduled yet"
      />
    )
  }

  const workPct = (job / total) * 100
  const drivePct = (drive / total) * 100
  const workLabel = `${Math.round(workPct)}% work`
  const driveLabel = `${Math.round(drivePct)}% drive`

  return (
    <div
      className={`w-full rounded-full bg-gray-100 relative overflow-hidden flex ${className}`}
      title={`${workLabel} · ${driveLabel}`}
    >
      {workPct > 0 && (
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${workPct}%`, backgroundColor: '#3DD57A' }}
        />
      )}
      {drivePct > 0 && (
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${drivePct}%`, backgroundColor: '#45B7D1' }}
        />
      )}
    </div>
  )
}
