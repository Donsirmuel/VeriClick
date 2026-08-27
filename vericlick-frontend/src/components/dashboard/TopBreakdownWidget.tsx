import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { Globe02Icon, SmartPhone01Icon, ShieldBanIcon, CheckmarkCircle02Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { Link } from 'react-router-dom'
import { fetchCountryRules, createCountryRule, deleteCountryRule, fetchDevicePolicy, updateDevicePolicy } from '@/api/traffic_rules'
import { CountryFlag, countryName } from '@/components/shared/CountryFlag'
import type { BreakdownRow, DeviceClass, TimeRange } from '@/types'

const BLOCKABLE_DEVICE_CLASSES: DeviceClass[] = ['mobile', 'tablet', 'desktop']

interface TopBreakdownWidgetProps {
  dimension: 'country' | 'device'
  rows: BreakdownRow[]
  range: TimeRange
  canManage: boolean
}

export function TopBreakdownWidget({ dimension, rows, canManage }: TopBreakdownWidgetProps) {
  const queryClient = useQueryClient()
  const isCountry = dimension === 'country'

  const { data: countryRulesData } = useQuery({
    queryKey: ['country-rules'],
    queryFn: fetchCountryRules,
    enabled: isCountry,
  })
  const { data: devicePolicy } = useQuery({
    queryKey: ['device-policy'],
    queryFn: fetchDevicePolicy,
    enabled: !isCountry,
  })

  const countryRules = countryRulesData?.results ?? []
  const denyRules = countryRules.filter(
    (r) => r.action === 'deny' && r.isActive,
  )

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['country-rules'] })
    queryClient.invalidateQueries({ queryKey: ['device-policy'] })
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] })
    queryClient.invalidateQueries({ queryKey: ['traffic'] })
    queryClient.invalidateQueries({ queryKey: ['activity'] })
  }

  const blockCountryMutation = useMutation({
    mutationFn: (code: string) =>
      createCountryRule({ countryCode: code, action: 'deny', isActive: true }),
    onSuccess: (_data, code) => {
      refresh()
      toast.success(`${countryName(code)} blocked — traffic is now sent to your page for blocked visitors`, {
        duration: 6000,
      })
    },
    onError: () => {
      toast.error('Could not block this country. Check your plan and try again.')
    },
  })

  const unblockCountryMutation = useMutation({
    mutationFn: (id: string) => deleteCountryRule(id),
    onSuccess: () => {
      refresh()
      toast.success('Country unblocked — traffic flows again')
    },
    onError: () => {
      toast.error('Could not unblock this country')
    },
  })

  const setDeviceBlockedMutation = useMutation({
    mutationFn: ({ cls, block }: { cls: DeviceClass; block: boolean }) => {
      const allowed = devicePolicy?.allowedDeviceClasses ?? ['mobile', 'tablet', 'desktop']
      const next = block
        ? allowed.filter((c) => c !== cls)
        : [...new Set([...allowed, cls])]
      return updateDevicePolicy({ allowedDeviceClasses: next })
    },
    onSuccess: (_data, { cls, block }) => {
      refresh()
      toast.success(`${cls} ${block ? 'blocked' : 'unblocked'} — device rules updated`)
    },
    onError: () => {
      toast.error('Could not update device rules')
    },
  })

  const blockedDeviceClasses = new Set(
    BLOCKABLE_DEVICE_CLASSES.filter(
      (c) => !(devicePolicy?.allowedDeviceClasses ?? ['mobile', 'tablet', 'desktop']).includes(c),
    ),
  )

  const title = isCountry ? 'Top Countries' : 'Top Devices'
  const subtitle = isCountry
    ? 'Where your clicks come from — block a country in one click'
    : 'Devices your visitors use — block a device type in one click'
  const emptyText = isCountry
    ? 'No country data in this period yet.'
    : 'No device data in this period yet.'

  const handleCountryBlock = (row: BreakdownRow) => {
    const existing = denyRules.find((r) => r.countryCode === row.key)
    if (existing) {
      unblockCountryMutation.mutate(existing.id)
    } else {
      blockCountryMutation.mutate(row.key)
    }
  }

  const handleDeviceToggle = (cls: DeviceClass) => {
    setDeviceBlockedMutation.mutate({ cls, block: !blockedDeviceClasses.has(cls) })
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="text-sm text-muted mt-1">{subtitle}</p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-neutral-100 flex items-center justify-center shrink-0">
          <HugeiconsIcon icon={isCountry ? Globe02Icon : SmartPhone01Icon} className="w-5 h-5 text-slate-700" />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        {rows.length === 0 && (
          <p className="text-sm text-muted py-6 text-center">{emptyText}</p>
        )}
        {rows.map((row) => {
          const isCountryBlocked = isCountry && denyRules.some((r) => r.countryCode === row.key)
          const isDeviceBlocked = !isCountry && blockedDeviceClasses.has(row.key as DeviceClass)
          const blocked = isCountry ? isCountryBlocked : isDeviceBlocked

          return (
            <div key={row.key} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-neutral-50 transition-colors">
              {isCountry ? (
                <CountryFlag code={row.key} />
              ) : (
                <div className="w-6 h-6 rounded-md bg-neutral-100 flex items-center justify-center shrink-0">
                  <HugeiconsIcon icon={SmartPhone01Icon} className="w-3.5 h-3.5 text-slate-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900 truncate">{row.label}</span>
                  {blocked && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-error bg-error/10 px-1.5 py-0.5 rounded-full">
                      Blocked
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">
                  {row.total.toLocaleString()} {isCountry ? 'visits' : 'visits'}
                  {row.blocked > 0 && (
                    <span className="text-error"> · {row.blocked.toLocaleString()} blocked</span>
                  )}
                </div>
              </div>
              {isCountry
                ? (
                  <button
                    onClick={() => handleCountryBlock(row)}
                    disabled={!canManage || blockCountryMutation.isPending || unblockCountryMutation.isPending}
                    title={canManage ? (blocked ? `Unblock ${row.label}` : `Block ${row.label}`) : 'Traffic rules are a paid feature. Upgrade to manage.'}
                    className={`p-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      blocked
                        ? 'bg-success/10 hover:bg-success/20 text-success'
                        : 'bg-error/10 hover:bg-error/20 text-error'
                    }`}
                  >
                    <HugeiconsIcon icon={blocked ? CheckmarkCircle02Icon : ShieldBanIcon} className="w-4 h-4" />
                  </button>
                )
                : (
                  BLOCKABLE_DEVICE_CLASSES.includes(row.key as DeviceClass) && (
                    <button
                      onClick={() => handleDeviceToggle(row.key as DeviceClass)}
                      disabled={!canManage || setDeviceBlockedMutation.isPending}
                      title={canManage ? (blocked ? `Allow ${row.label} again` : `Block ${row.label}`) : 'Traffic rules are a paid feature. Upgrade to manage.'}
                      className={`p-2 rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        blocked
                          ? 'bg-success/10 hover:bg-success/20 text-success'
                          : 'bg-error/10 hover:bg-error/20 text-error'
                      }`}
                    >
                      <HugeiconsIcon icon={blocked ? CheckmarkCircle02Icon : ShieldBanIcon} className="w-4 h-4" />
                    </button>
                  )
                )}
            </div>
          )
        })}
      </div>

      <Link
        to="/app/traffic-rules"
        className="w-full mt-6 py-3 text-sm font-bold text-black hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-all flex items-center justify-center gap-1.5"
      >
        Manage Traffic Rules <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
      </Link>
    </div>
  )
}
