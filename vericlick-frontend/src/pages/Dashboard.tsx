import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity01Icon, Shield02Icon, LinkSquare02Icon, Globe02Icon } from '@hugeicons/core-free-icons'
import { StatCard } from '@/components/dashboard/StatCard'
import { TrafficChart } from '@/components/dashboard/TrafficChart'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { DomainHealthWidget } from '@/components/dashboard/DomainHealthWidget'
import { fetchDashboardStats, fetchTrafficData, fetchActivity } from '@/api/dashboard'
import type { TimeRange } from '@/types'

export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>('7d')

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  const { data: trafficData } = useQuery({
    queryKey: ['traffic', range],
    queryFn: () => fetchTrafficData(range),
  })

  const { data: activity } = useQuery({
    queryKey: ['activity'],
    queryFn: fetchActivity,
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-muted mt-1">Traffic analytics and system overview</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" />
          All systems operational
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Clicks (24h)"
          value={(stats?.totalClicks24h ?? 0).toLocaleString()}
          icon={Activity01Icon}
          trend={{ value: 12.5, isPositive: true }}
          color="primary"
        />
        <StatCard
          title="Bots Blocked"
          value={(stats?.botTrafficBlocked ?? 0).toLocaleString()}
          subValue={`${stats?.botTrafficPercentage ?? 0}% of total traffic`}
          icon={Shield02Icon}
          color="error"
        />
        <StatCard
          title="Active Links"
          value={stats?.activeLinks ?? 0}
          icon={LinkSquare02Icon}
          color="primary"
        />
        <StatCard
          title="Domain Health"
          value={`${stats?.domainsHealthy ?? 0}/${(stats?.domainsHealthy ?? 0) + (stats?.domainsDegraded ?? 0) + (stats?.domainsBlacklisted ?? 0)}`}
          subValue={`${stats?.domainsBlacklisted ?? 0} blacklisted`}
          icon={Globe02Icon}
          color={(stats?.domainsBlacklisted ?? 0) > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Chart */}
        <div className="lg:col-span-2">
          <TrafficChart
            data={trafficData ?? []}
            range={range}
            onRangeChange={setRange}
          />
        </div>

        {/* Right: Domain Health */}
        <div className="lg:col-span-1">
          <DomainHealthWidget
            healthy={stats?.domainsHealthy ?? 0}
            degraded={stats?.domainsDegraded ?? 0}
            blacklisted={stats?.domainsBlacklisted ?? 0}
          />
        </div>
      </div>

      {/* Activity Feed */}
      <div className="mt-6">
        <ActivityFeed activity={activity ?? []} />
      </div>
    </div>
  )
}
