import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Activity01Icon, Shield02Icon, ShieldIcon, CheckmarkCircle02Icon, CodeIcon, Globe02Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { StatCard } from '@/components/dashboard/StatCard'
import { TrafficChart } from '@/components/dashboard/TrafficChart'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { BlockedQueueWidget } from '@/components/dashboard/BlockedQueueWidget'
import { TopBreakdownWidget } from '@/components/dashboard/TopBreakdownWidget'
import { fetchDashboardStats, fetchTrafficData, fetchActivity, fetchBreakdown } from '@/api/dashboard'
import { fetchDashboardDomains, fetchDomains } from '@/api/workspace'
import { fetchWorkspace } from '@/api/workspace'
import { FreeTierBanner } from '@/components/FreeTierBanner'
import { DashboardSkeleton } from '@/components/ui/DashboardSkeleton'
import type { TimeRange } from '@/types'

// Listed in SESSION_KEYS so signing out clears it with everything else.
const SHIELD_TOAST_KEY = 'vericlick-first-bot-blocked-toast'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [range, setRange] = useState<TimeRange>('7d')
  const [selectedDomain, setSelectedDomain] = useState('')

  const { data: dashboardDomains } = useQuery({
    queryKey: ['dashboard-domains'],
    queryFn: fetchDashboardDomains,
  })

  // Full registry records — dashboard-domains only carries name/registered/
  // hasTraffic, and the setup state needs verified/scriptInstalled.
  const { data: registeredDomains } = useQuery({
    queryKey: ['domains'],
    queryFn: fetchDomains,
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

  // Paging is per-domain: switching the filter starts at the top of the new
  // feed rather than page 4 of a list that may only have two pages.
  const [activityPage, setActivityPage] = useState(1)
  useEffect(() => { setActivityPage(1) }, [selectedDomain])

  const { data: activityData, isLoading: activityLoading } = useQuery({
    queryKey: ['activity', selectedDomain, activityPage],
    queryFn: () => fetchActivity(domainParam, activityPage),
    // Keep the previous page on screen while the next loads, so the table does
    // not collapse to a spinner and shove the page around on every click.
    placeholderData: (previous) => previous,
  })
  const activity = activityData?.results

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
    ? false
    : workspace.planName !== null || workspace.trialActive

  const totalVisits = stats?.totalVisits24h ?? 0
  const hasData = totalVisits > 0

  if (statsLoading || activityLoading) {
    return <DashboardSkeleton />
  }

  // "No traffic yet" is a DATA state, not an unfinished SETUP state. Showing the
  // setup checklist to someone who has already paid, added domains and installed
  // the script tells them to redo work they've done — and it would reappear for
  // any real customer whose site simply went quiet for a day.
  const hasPlan = !!workspace?.planName
  const activeDomains = registeredDomains?.filter((d) => d.isActive) ?? []
  const hasDomain = activeDomains.length > 0
  const scriptLive = activeDomains.some((d) => d.verified || d.scriptInstalled)
  const setupComplete = hasPlan && hasDomain && scriptLive

  // Guard both takeovers on there being no domain filter. Selecting a quiet
  // domain used to replace the entire page, header and dropdown included, so
  // the user could not switch back to one that had traffic.
  const wholeWorkspaceEmpty = !hasData && !!stats && !selectedDomain

  if (wholeWorkspaceEmpty && setupComplete) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">You're protected</h1>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed mb-8">
            Setup is complete and VeriClick is watching
            {activeDomains.length === 1
              ? ` ${activeDomains[0].domain}`
              : ` your ${activeDomains.length} domains`}
            . There have been no visitors in the last 24 hours — charts and activity
            will fill in as traffic arrives.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => navigate('/app/redirects')}
              className="bg-black hover:bg-neutral-800 text-white px-6 py-3 rounded-xl text-sm font-bold transition-all"
            >
              Create a redirect link
            </button>
            <button
              onClick={() => navigate('/app/shield')}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-6 py-3 rounded-xl text-sm font-bold transition-colors"
            >
              Configure anti-bot
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (wholeWorkspaceEmpty) {
    const steps = [
      {
        done: hasPlan,
        href: '/app/billing',
        icon: ShieldIcon,
        title: 'Choose a plan',
        body: 'Pay once with crypto — weekly or monthly access.',
      },
      {
        done: hasDomain,
        href: '/app/domains',
        icon: Globe02Icon,
        title: 'Add your domain',
        body: 'Register the domain you want to protect.',
      },
      {
        done: scriptLive,
        href: '/app/shield',
        icon: CodeIcon,
        title: 'Install the script',
        body: "Paste the snippet into your site's <head>. This also verifies the domain.",
      },
    ]
    const remaining = steps.filter((s) => !s.done).length

    return (
      <div className="max-w-3xl mx-auto py-12 px-4">
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-neutral-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <HugeiconsIcon icon={Activity01Icon} className="w-9 h-9 text-muted" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Get started with VeriClick</h1>
          <p className="text-sm text-muted max-w-md mx-auto leading-relaxed">
            {remaining === steps.length
              ? 'Three steps and your site is protected from bots.'
              : `${remaining} step${remaining !== 1 ? 's' : ''} left — you're nearly there.`}
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {steps.map((step, i) => (
            <a
              key={step.title}
              href={step.href}
              className={`w-full flex items-start gap-4 p-4 border rounded-2xl text-left transition-all ${
                step.done
                  ? 'bg-emerald-50/50 border-emerald-200'
                  : 'bg-white border-neutral-200 hover:border-neutral-400 hover:shadow-sm'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  step.done ? 'bg-emerald-100' : 'bg-neutral-100'
                }`}
              >
                <HugeiconsIcon
                  icon={step.done ? CheckmarkCircle02Icon : step.icon}
                  className={`w-5 h-5 ${step.done ? 'text-emerald-600' : 'text-muted'}`}
                />
              </div>
              <div className="flex-1">
                <span className={`font-bold text-sm ${step.done ? 'text-emerald-800' : 'text-slate-900'}`}>
                  {i + 1}. {step.title}
                </span>
                <p className="text-xs text-muted mt-0.5 leading-relaxed">
                  {step.done ? 'Done' : step.body}
                </p>
              </div>
            </a>
          ))}
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
            <span>Anti-bot active</span>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <FreeTierBanner workspace={workspace} />
      </div>

      {/* A selected domain with no traffic: say so plainly rather than showing
          a page of zeroed charts, while keeping the picker above reachable. */}
      {!hasData && stats && selectedDomain && (
        <div className="mb-8 bg-white border border-neutral-200 rounded-2xl p-8 text-center">
          <div className="w-12 h-12 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HugeiconsIcon icon={Activity01Icon} className="w-6 h-6 text-muted" />
          </div>
          <h2 className="text-base font-bold text-slate-900 mb-1">
            No traffic for {selectedDomain} yet
          </h2>
          <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed mb-5">
            It's being watched — there just haven't been any visitors in the last 24 hours.
          </p>
          <button
            onClick={() => setSelectedDomain('')}
            className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-2.5 rounded-xl text-sm font-bold transition-colors"
          >
            Show all domains
          </button>
        </div>
      )}

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

      {workspace?.onboardingType === 'shield' && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Also protect your ad links</h3>
          <p className="text-xs text-muted mb-3">Set up smart redirects to filter bot traffic from your campaigns.</p>
          <button onClick={() => navigate('/app/redirects')} className="text-xs font-bold text-slate-900 underline">
            Set up redirects →
          </button>
        </div>
      )}
      {workspace?.onboardingType === 'redirect' && (
        <div className="bg-white rounded-2xl border border-neutral-200 p-6 mb-6">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Also protect your website</h3>
          <p className="text-xs text-muted mb-3">Add anti-bot protection to your main website with a single script.</p>
          <button onClick={() => navigate('/app/shield')} className="text-xs font-bold text-slate-900 underline">
            Get your script →
          </button>
        </div>
      )}

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
        <ActivityFeed
          activity={activity ?? []}
          page={activityData?.page ?? 1}
          totalPages={activityData?.totalPages ?? 1}
          total={activityData?.total ?? 0}
          windowFull={activityData?.windowFull ?? false}
          windowSize={activityData?.windowSize ?? 200}
          onPageChange={setActivityPage}
        />
      </div>
    </div>
  )
}
