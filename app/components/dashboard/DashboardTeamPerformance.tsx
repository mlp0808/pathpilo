'use client'

export interface EmployeeStatsRow {
  userId: number
  firstName: string
  lastName: string
  completedJobs: number
  completedRevenue: number
  upcomingJobs: number
  upcomingRevenue: number
  totalHours: number
}

interface DashboardTeamPerformanceProps {
  employees: EmployeeStatsRow[]
  loading: boolean
  formatPrice: (price: number) => string
  formatDuration: (minutes: number) => string
  rangeLabel: string
}

export default function DashboardTeamPerformance({
  employees,
  loading,
  formatPrice,
  formatDuration,
  rangeLabel,
}: DashboardTeamPerformanceProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Team Performance</h3>
          <p className="text-xs sm:text-sm text-gray-600">Loading team stats for {rangeLabel}…</p>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-accent-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (employees.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-gray-50">
          <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Team Performance</h3>
          <p className="text-xs sm:text-sm text-gray-600">
            No employee activity in {rangeLabel}
          </p>
        </div>
        <div className="px-4 sm:px-6 py-10 text-center text-sm text-gray-500">
          Adjust the timeline above or pick a different period.
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Team Performance</h3>
        <p className="text-xs sm:text-sm text-gray-600">
          Revenue and job statistics by employee · {rangeLabel}
        </p>
      </div>

      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-4 text-left text-xs font-bold text-gray-700 uppercase tracking-wider">
                Employee
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Completed Jobs
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Completed Revenue
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Upcoming Jobs
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Upcoming Revenue
              </th>
              <th className="px-6 py-4 text-right text-xs font-bold text-gray-700 uppercase tracking-wider">
                Hours Worked
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {employees.map((emp, index) => (
              <tr
                key={emp.userId}
                className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-gradient-to-br from-accent-400 to-accent-600 rounded-full flex items-center justify-center mr-3 shadow-sm">
                      <span className="text-sm font-bold text-white">
                        {emp.firstName.charAt(0)}
                        {emp.lastName.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {emp.firstName} {emp.lastName}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                  {emp.completedJobs}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-semibold text-gray-900">
                  {formatPrice(emp.completedRevenue)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                  {emp.upcomingJobs}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                  {formatPrice(emp.upcomingRevenue)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                  {formatDuration(emp.totalHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="md:hidden divide-y divide-gray-200">
        {employees.map((emp) => (
          <li key={emp.userId} className="p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-accent-400 to-accent-600 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
                <span className="text-sm font-bold text-white">
                  {emp.firstName.charAt(0)}
                  {emp.lastName.charAt(0)}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-gray-900 truncate">
                  {emp.firstName} {emp.lastName}
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5">
                  {formatDuration(emp.totalHours)} worked
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-green-50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-green-700/80">
                  Completed
                </div>
                <div className="text-sm font-semibold text-gray-900 mt-0.5">
                  {emp.completedJobs} jobs
                </div>
                <div className="text-xs text-gray-700">{formatPrice(emp.completedRevenue)}</div>
              </div>
              <div className="bg-blue-50 rounded-lg px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide font-semibold text-blue-700/80">
                  Upcoming
                </div>
                <div className="text-sm font-semibold text-gray-900 mt-0.5">
                  {emp.upcomingJobs} jobs
                </div>
                <div className="text-xs text-gray-700">{formatPrice(emp.upcomingRevenue)}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
