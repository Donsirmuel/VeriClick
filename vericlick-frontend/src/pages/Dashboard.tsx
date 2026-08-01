import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon, LinkSquare02Icon, Globe02Icon, PlusSignIcon, Shield02Icon } from '@hugeicons/core-free-icons'
import { StatCard } from '@/components/dashboard/StatCard'
import { TrafficChart } from '@/components/dashboard/TrafficChart'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { DomainHealthWidget } from '@/components/dashboard/DomainHealthWidget'
import { fetchDashboardStats, fetchTrafficData, fetchActivity } from '@/api/dashboard'
import type { TimeRange } from '@/types'

export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>('7d')
  const navigate = useNavigate()

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

  const totalClicks = stats?.totalClicks24h ?? 0
  const activeLinks = stats?.activeLinks ?? 0
  const hasData = totalClicks > 0 || activeLinks > 0

  if (!hasData && stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4">
        <div className="w-20 h-20 bg-neutral-100 rounded-3xl flex items-center justify-center mb-6">
          <HugeiconsIcon icon={Activity01Icon} className="w-9 h-9 text-muted" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to VeriClick</h1>
        <p className="text-sm text-muted text-center max-w-md mb-8 leading-relaxed">
          Your dashboard is empty because you haven't created any links yet. 
          Get started by creating your first tracking link — then come back here to see your traffic analytics.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/app/links')}
            className="bg-black hover:bg-neutral-800 text-white px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
          >
            <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
            Create your first link
          </button>
          <button
            onClick={() => navigate('/app/ip-rules')}
            className="bg-white border border-neutral-200 hover:bg-neutral-50 px-6 py-3 rounded-xl text-sm font-bold flex items-center gap-2 transition-all"
          >
            <HugeiconsIcon icon={Shield02Icon} className="w-4 h-4" />
            Set up IP rules
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 max-w-2xl w-full">
          {[
            { step: '1', title: 'Create a link', desc: 'Set up your first tracking link with a custom slug and destination URL.' },
            { step: '2', title: 'Add IP rules', desc: 'Allow trusted traffic and block suspicious sources with simple rules.' },
            { step: '3', title: 'Monitor traffic', desc: 'Watch real-time analytics of clicks, bot detections, and blocked traffic.' },
          ].map((item) => (
            <div key={item.step} className="bg-white border border-neutral-200 rounded-2xl p-5 text-center">
              <div className="w-8 h-8 bg-black text-white rounded-lg flex items-center justify-center mx-auto mb-3 text-sm font-bold">{item.step}</div>
              <h3 className="font-bold text-sm text-slate-900 mb-1">{item.title}</h3>
              <p className="text-xs text-muted leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-muted mt-1">Traffic analytics and system overview</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-lg">
          <div className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse" />
          {stats?.lastDomainScan
            ? `Last domain scan: ${new Date(stats.lastDomainScan).toLocaleString()}`
            : 'All systems operational'}
        </div>
      </div>

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

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrafficChart
            data={trafficData ?? []}
            range={range}
            onRangeChange={setRange}
          />
        </div>
        <div className="lg:col-span-1">
          <DomainHealthWidget
            healthy={stats?.domainsHealthy ?? 0}
            degraded={stats?.domainsDegraded ?? 0}
            blacklisted={stats?.domainsBlacklisted ?? 0}
          />
        </div>
      </div>

      <div className="mt-6">
        <ActivityFeed activity={activity ?? []} />
      </div>
    </div>
  )
}
