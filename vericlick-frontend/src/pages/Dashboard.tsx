import { useState } from 'react'
import { Activity01Icon, Shield02Icon, LinkSquare02Icon, Globe02Icon } from '@hugeicons/core-free-icons'
import { StatCard } from '@/components/dashboard/StatCard'
import { TrafficChart } from '@/components/dashboard/TrafficChart'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { DomainHealthWidget } from '@/components/dashboard/DomainHealthWidget'
import { mockDashboardStats, mockTrafficData, mockActivity } from '@/api/mock'
import type { TimeRange } from '@/types'

export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>('7d')

  const stats = mockDashboardStats

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
          value={stats.totalClicks24h.toLocaleString()}
          icon={Activity01Icon}
          trend={{ value: 12.5, isPositive: true }}
          color="primary"
        />
        <StatCard 
          title="Bots Blocked"
          value={stats.botTrafficBlocked.toLocaleString()}
          subValue={`${stats.botTrafficPercentage}% of total traffic`}
          icon={Shield02Icon}
          color="error"
        />
        <StatCard 
          title="Active Links"
          value={stats.activeLinks}
          icon={LinkSquare02Icon}
          color="primary"
        />
        <StatCard 
          title="Domain Health"
          value={`${stats.domainsHealthy}/${stats.domainsHealthy + stats.domainsDegraded + stats.domainsBlacklisted}`}
          subValue={`${stats.domainsBlacklisted} blacklisted`}
          icon={Globe02Icon}
          color={stats.domainsBlacklisted > 0 ? 'warning' : 'success'}
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: Chart */}
        <div className="lg:col-span-2">
          <TrafficChart 
            data={mockTrafficData[range]} 
            range={range} 
            onRangeChange={setRange} 
          />
        </div>

        {/* Right: Domain Health */}
        <div className="lg:col-span-1">
          <DomainHealthWidget 
            healthy={stats.domainsHealthy}
            degraded={stats.domainsDegraded}
            blacklisted={stats.domainsBlacklisted}
          />
        </div>
      </div>

      {/* Activity Feed */}
      <div className="mt-6">
        <ActivityFeed activity={mockActivity} />
      </div>
    </div>
  )
}
