import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon, Shield02Icon, ShieldIcon, CheckmarkCircle02Icon, CodeIcon, Globe02Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { StatCard } from '@/components/dashboard/StatCard'
import { TrafficChart } from '@/components/dashboard/TrafficChart'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { BlockedQueueWidget } from '@/components/dashboard/BlockedQueueWidget'
import { TopBreakdownWidget } from '@/components/dashboard/TopBreakdownWidget'
import { fetchDashboardStats, fetchTrafficData, fetchActivity, fetchBreakdown } from '@/api/dashboard'
import { fetchDashboardDomains } from '@/api/workspace'
import { fetchWorkspace } from '@/api/workspace'
import { FreeTierBanner } from '@/components/FreeTierBanner'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'
import type { TimeRange } from '@/types'

const SHIELD_TOAST_KEY = 'vericlick-first-bot-blocked-toast'

export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>('7d')
  const [selectedDomain, setSelectedDomain] = useState('')

  const { data: dashboardDomains } = useQuery({
    queryKey: ['dashboard-domains'],
    queryFn: fetchDashboardDomains,
  })

  const domainParam = selectedDomain || undefined

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats', selectedDomain],
    queryFn: () => fetchDashboardStats(domainParam),
  })

  const { data: trafficData, isFetching: trafficFetching } = useQuery({
    queryKey: ['traffic', range, selectedDomain],
    queryFn: () => fetchTrafficData(range, domainParam),
  })

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['activity', selectedDomain],
    queryFn: () => fetchActivity(domainParam),
  })

  const { data: countryBreakdown } = useQuery({
    queryKey: ['breakdown', 'country', range, selectedDomain],
    queryFn: () => fetchBreakdown('country', range, domainParam),
  })

  const { data: deviceBreakdown } = useQuery({
    queryKey: ['breakdown', 'device', range, selectedDomain],
    queryFn: () => fetchBreakdown('device', range, domainParam),
  })

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  useEffect(() => {
    if (!activity) return
    const now = Date.now()
    const RECENT_WINDOW_MS = 10 * 60 * 1000
    const recentBotBlock = activity.some((e) => {
      if (!e.isBot) return false
      const at = e.createdAt ? new Date(e.createdAt).getTime() : NaN
      return Number.isFinite(at) && now - at <= RECENT_WINDOW_MS
    })
    if (!recentBotBlock) return
    try {
      const today = new Date().toDateString()
      if (localStorage.getItem(SHIELD_TOAST_KEY) === today) return
      localStorage.setItem(SHIELD_TOAST_KEY, today)
    } catch {
      // Ignore storage errors
    }
    toast.success(
      'VeriClick just blocked a suspicious visitor. No action needed.',
      { duration: 7000, id: 'first-bot-blocked' },
    )
  }, [activity])

  const canManageRules = !workspace
    ? true
    : workspace.planName !== null || workspace.trialActive

  const totalVisits = stats?.totalVisits24h ?? 0
  const hasData = totalVisits > 0

  if (statsLoading || activityLoading) {
    return <DashboardSkeleton />
  }

  if (!hasData && stats) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-neutral-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <HugeiconsIcon icon={Activity01Icon} className="w-9 h-9 text-muted" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Get started with VeriClick</h1>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
            Register your domain, install the script, and start protecting your site from bots.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          <a
            href="/app/domains"
            className="w-full flex items-start gap-4 p-4 bg-white border border-neutral-200 rounded-2xl text-left hover:border-neutral-400 hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={Globe02Icon} className="w-5 h-5 text-muted" />
            </div>
            <div className="flex-1">
              <span className="font-bold text-sm text-slate-900">1. Add your domain</span>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Register the domain you want to protect. No DNS changes needed.
              </p>
            </div>
          </a>

          <a
            href="/app/install"
            className="w-full flex items-start gap-4 p-4 bg-white border border-neutral-200 rounded-2xl text-left hover:border-neutral-400 hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={CodeIcon} className="w-5 h-5 text-muted" />
            </div>
            <div className="flex-1">
              <span className="font-bold text-sm text-slate-900">2. Install the script</span>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Copy one line of code and paste it into your website's head tag.
              </p>
            </div>
          </a>

          <a
            href="/app/shield"
            className="w-full flex items-start gap-4 p-4 bg-white border border-neutral-200 rounded-2xl text-left hover:border-neutral-400 hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={Shield02Icon} className="w-5 h-5 text-muted" />
            </div>
            <div className="flex-1">
              <span className="font-bold text-sm text-slate-900">3. Configure protection</span>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Choose how strict the protection should be and what happens to bots.
              </p>
            </div>
          </a>

          <a
            href="/pricing"
            className="w-full flex items-start gap-4 p-4 bg-white border border-neutral-200 rounded-2xl text-left hover:border-neutral-400 hover:shadow-sm transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center shrink-0">
              <HugeiconsIcon icon={ShieldIcon} className="w-5 h-5 text-muted" />
            </div>
            <div className="flex-1">
              <span className="font-bold text-sm text-slate-900">4. Choose a plan</span>
              <p className="text-xs text-muted mt-0.5 leading-relaxed">
                Select a plan to activate protection on your site.
              </p>
            </div>
          </a>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-muted mt-1">Traffic analytics and protection overview</p>
        </div>
        <div className="flex items-center gap-3">
          {dashboardDomains && dashboardDomains.length > 0 && (
            <select
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
              className="text-sm bg-neutral-100 border border-neutral-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="">All domains</option>
              {dashboardDomains.map((d) => (
                <option key={d.domain} value={d.domain}>
                  {d.domain}
                </option>
              ))}
            </select>
          )}
          <div className="inline-flex items-center gap-2 text-sm text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-lg">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse shrink-0" />
            <span>Shield active</span>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <FreeTierBanner workspace={workspace} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Visits (24h)"
          value={(stats?.totalVisits24h ?? 0).toLocaleString()}
          icon={Activity01Icon}
          trend={stats?.clicksTrend != null
            ? { value: stats.clicksTrend, isPositive: stats.clicksTrend >= 0 }
            : undefined}
          color="primary"
        />
        <StatCard
          title="Humans (24h)"
          value={(stats?.allowed ?? 0).toLocaleString()}
          subValue="Legitimate visitors"
          icon={CheckmarkCircle02Icon}
          color="success"
        />
        <StatCard
          title="Bots Blocked"
          value={(stats?.botsBlocked ?? 0).toLocaleString()}
          subValue={`${stats?.botTrafficPercentage ?? 0}% of total traffic`}
          icon={Shield02Icon}
          color="error"
        />
        <StatCard
          title="Protection Mode"
          value={(stats?.protectionMode ?? 'balanced').charAt(0).toUpperCase() + (stats?.protectionMode ?? 'balanced').slice(1)}
          subValue={`Action: ${stats?.botAction ?? 'block'}`}
          icon={ShieldIcon}
          color="primary"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TrafficChart
            data={trafficData ?? []}
            range={range}
            onRangeChange={setRange}
            loading={trafficFetching && (trafficData?.length ?? 0) === 0}
          />
        </div>
        <div className="lg:col-span-1">
          <BlockedQueueWidget activity={activity ?? []} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mt-6">
        <TopBreakdownWidget
          dimension="country"
          rows={countryBreakdown ?? []}
          range={range}
          canManage={canManageRules}
        />
        <TopBreakdownWidget
          dimension="device"
          rows={deviceBreakdown ?? []}
          range={range}
          canManage={canManageRules}
        />
      </div>

      <div className="mt-6">
        <ActivityFeed activity={activity ?? []} />
      </div>
    </div>
  )
}
