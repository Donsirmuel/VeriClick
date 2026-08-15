import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon, LinkSquare02Icon, Globe02Icon, Shield02Icon, Copy01Icon, CodeIcon, CheckmarkCircle02Icon, ArrowRight02Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { StatCard } from '@/components/dashboard/StatCard'
import { TrafficChart } from '@/components/dashboard/TrafficChart'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { DomainHealthWidget } from '@/components/dashboard/DomainHealthWidget'
import { BlockedQueueWidget } from '@/components/dashboard/BlockedQueueWidget'
import { TopBreakdownWidget } from '@/components/dashboard/TopBreakdownWidget'
import { fetchDashboardStats, fetchTrafficData, fetchActivity, fetchBreakdown } from '@/api/dashboard'
import { fetchDomains } from '@/api/domains'
import { fetchWorkspace } from '@/api/workspace'
import { FreeTierBanner } from '@/components/FreeTierBanner'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'
import type { TimeRange } from '@/types'

const SHIELD_TOAST_KEY = 'vericlick-first-bot-blocked-toast'

export default function DashboardPage() {
  const [range, setRange] = useState<TimeRange>('7d')
  const navigate = useNavigate()

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: fetchDashboardStats,
  })

  const { data: trafficData, isFetching: trafficFetching } = useQuery({
    queryKey: ['traffic', range],
    queryFn: () => fetchTrafficData(range),
  })

  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: fetchActivity,
  })

  const { data: countryBreakdown } = useQuery({
    queryKey: ['breakdown', 'country', range],
    queryFn: () => fetchBreakdown('country', range),
  })

  const { data: deviceBreakdown } = useQuery({
    queryKey: ['breakdown', 'device', range],
    queryFn: () => fetchBreakdown('device', range),
  })

  const { data: domains, isLoading: domainsLoading } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
  })

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  useEffect(() => {
    if (!activity) return
    // Only celebrate a *fresh* block. Activity keeps the last 50 events, so an
    // old bot (blocked hours or days ago) must not re-trigger the toast — the
    // first time a bot is blocked the account sees it here within minutes.
    const now = Date.now()
    const RECENT_WINDOW_MS = 10 * 60 * 1000
    const recentBotBlock = activity.some((e) => {
      if (!e.isBot) return false
      const at = e.time ? new Date(e.time).getTime() : NaN
      return Number.isFinite(at) && now - at <= RECENT_WINDOW_MS
    })
    if (!recentBotBlock) return
    try {
      const today = new Date().toDateString()
      if (localStorage.getItem(SHIELD_TOAST_KEY) === today) return
      localStorage.setItem(SHIELD_TOAST_KEY, today)
    } catch {
      // Ignore storage errors — the toast is best-effort.
    }
    toast.success(
      'VeriClick just blocked a suspicious bot — it was diverted to your safe destination automatically, no action needed.',
      { duration: 7000, id: 'first-bot-blocked' },
    )
  }, [activity])

  const canManageRules = !workspace
    ? true
    : workspace.planName !== null || workspace.trialActive

  const totalClicks = stats?.totalClicks24h ?? 0
  const activeLinks = stats?.activeLinks ?? 0
  const hasData = totalClicks > 0 || activeLinks > 0

  if (statsLoading || activityLoading || domainsLoading) {
    return <DashboardSkeleton />
  }

  if (!hasData && stats) {
    const domainsCount =
      (stats.domainsHealthy ?? 0) + (stats.domainsDegraded ?? 0) + (stats.domainsBlacklisted ?? 0)

    const steps = [
      {
        n: 1,
        title: 'Add your domain',
        desc: 'Register the web address your tracked links live on. It\u2019s authorized the moment you register it.',
        to: '/app/domains',
        icon: Globe02Icon,
        done: domainsCount > 0,
      },
      {
        n: 2,
        title: 'Point your domain at VeriClick',
        desc: 'Add one short CNAME record and your links use your own brand. Until then they use the VeriClick URL — either way they work.',
        to: '/app/domains',
        icon: Globe02Icon,
        done: (domains ?? []).some((d) => d.ready),
      },
      {
        n: 3,
        title: 'Create a tracked link',
        desc: 'Point a tracked link at the page you want to protect.',
        to: '/app/links',
        icon: LinkSquare02Icon,
        done: activeLinks > 0,
      },
      {
        n: 4,
        title: 'Copy your tracked link',
        desc: 'Share the link — humans get through, suspicious traffic gets blocked.',
        to: '/app/links',
        icon: Copy01Icon,
        done: activeLinks > 0,
      },
      {
        n: 5,
        title: 'Install the site script',
        desc: 'Add extra detection to pages you own with one line of code.',
        to: '/app/settings',
        icon: CodeIcon,
        done: false,
        optional: true,
      },
    ]
    const coreSteps = steps.filter((s) => !s.optional)
    const doneCount = coreSteps.filter((s) => s.done).length

    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-neutral-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <HugeiconsIcon icon={Activity01Icon} className="w-9 h-9 text-muted" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Get started with VeriClick</h1>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
            Set up your first tracked link in a few minutes. Bots are stopped automatically —
            you just share the link.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {steps.map((step) => (
            <button
              key={step.n}
              onClick={() => navigate(step.to)}
              className="w-full flex items-start gap-4 p-4 bg-white border border-neutral-200 rounded-2xl text-left hover:border-neutral-400 hover:shadow-sm transition-all"
            >
              <div className={`relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${step.done ? 'bg-success-bright shadow-sm' : 'bg-neutral-100'}`}>
                {step.done ? (
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-6 h-6 text-white" />
                ) : (
                  <HugeiconsIcon icon={step.icon} className="w-5 h-5 text-muted" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900">{step.n}. {step.title}</span>
                  {step.optional && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted bg-neutral-100 px-2 py-0.5 rounded-full">Optional</span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">{step.desc}</p>
              </div>
              <HugeiconsIcon icon={ArrowRight02Icon} className="w-4 h-4 text-neutral-300 mt-3 shrink-0" />
            </button>
          ))}
        </div>

        <p className="text-center text-xs text-muted">
          {doneCount} of {coreSteps.length} core steps done
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-muted mt-1">Traffic analytics and system overview</p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-neutral-500 bg-neutral-100 px-3 py-1.5 rounded-lg max-w-full truncate">
          <div className="w-2 h-2 rounded-full bg-neutral-400 animate-pulse shrink-0" />
          <span className="truncate">
            {stats?.lastDomainScan
              ? `Last domain scan: ${new Date(stats.lastDomainScan).toLocaleString()}`
              : 'No domain scan yet'}
          </span>
        </div>
      </div>

      <div className="mb-8">
        <FreeTierBanner workspace={workspace} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Total Clicks (24h)"
          value={(stats?.totalClicks24h ?? 0).toLocaleString()}
          icon={Activity01Icon}
          trend={stats?.clicksTrend != null
            ? { value: stats.clicksTrend, isPositive: stats.clicksTrend >= 0 }
            : undefined}
          color="primary"
        />
        <StatCard
          title="Human Clicks (24h)"
          value={(stats?.allowed ?? 0).toLocaleString()}
          subValue="Legitimate visitors"
          icon={CheckmarkCircle02Icon}
          color="success"
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
            loading={trafficFetching && (trafficData?.length ?? 0) === 0}
          />
        </div>
        <div className="lg:col-span-1">
          <DomainHealthWidget
            healthy={stats?.domainsHealthy ?? 0}
            degraded={stats?.domainsDegraded ?? 0}
            blacklisted={stats?.domainsBlacklisted ?? 0}
            lastScan={stats?.lastDomainScan ?? null}
          />
          <div className="mt-6">
            <BlockedQueueWidget activity={activity ?? []} />
          </div>
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
