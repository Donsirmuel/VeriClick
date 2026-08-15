import { useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon, PlusSignIcon } from '@hugeicons/core-free-icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { CountryFlag, countryName, COMMON_COUNTRIES } from '@/components/shared/CountryFlag'
import type { TrackingLink, LinkCreateInput, DeviceClass, BotAction } from '@/types'

const createLinkSchema = z.object({
  slug: z.string().min(0).max(50).optional().or(z.literal('')),
  destinationUrl: z.string().url('Must be a valid URL'),
  domain: z.string().min(1, 'Select a domain'),
  status: z.enum(['active', 'paused']),
  safeUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
})

type CreateLinkForm = z.infer<typeof createLinkSchema>

const DEVICE_OPTIONS: { value: DeviceClass; label: string }[] = [
  { value: 'mobile', label: 'Mobile' },
  { value: 'tablet', label: 'Tablet' },
  { value: 'desktop', label: 'Desktop' },
]

const BOT_ACTIONS: { value: BotAction; label: string; desc: string }[] = [
  { value: 'safe', label: 'Send to page for blocked visitors', desc: 'Bots land on your page for blocked visitors (recommended)' },
  { value: 'not_found', label: 'Show 404', desc: 'Pretend the link doesn\'t exist' },
  { value: 'block', label: 'Block (403)', desc: 'Return an error to the bot' },
]

interface CreateLinkModalProps {
  onClose: () => void
  onSubmit: (data: LinkCreateInput) => void
  domains: string[]
  initialData?: TrackingLink
}

export function CreateLinkModal({ onClose, onSubmit, domains, initialData }: CreateLinkModalProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<CreateLinkForm>({
    resolver: zodResolver(createLinkSchema),
    defaultValues: initialData ? {
      slug: initialData.slug,
      destinationUrl: initialData.destinationUrl,
      domain: initialData.domain ?? domains[0] ?? '',
      status: (initialData.status === 'disabled' ? 'paused' : initialData.status) as 'active' | 'paused',
      safeUrl: initialData.safeUrl ?? '',
    } : {
      slug: '',
      destinationUrl: '',
      domain: domains[0] || '',
      status: 'active' as 'active' | 'paused',
      safeUrl: '',
    }
  })

  const [allowedDevices, setAllowedDevices] = useState<DeviceClass[]>(initialData?.allowedDevices ?? [])
  const [allowedCountries, setAllowedCountries] = useState<string[]>(initialData?.allowedCountries ?? [])
  const [countryInput, setCountryInput] = useState('')
  const [botAction, setBotAction] = useState<BotAction>(initialData?.botAction ?? 'safe')

  const toggleDevice = (value: DeviceClass) => {
    setAllowedDevices(prev => prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value])
  }

  const addCountry = (code: string) => {
    const c = (code || '').trim().toUpperCase()
    if (c.length === 2 && !allowedCountries.includes(c)) {
      setAllowedCountries(prev => [...prev, c])
    }
    setCountryInput('')
  }

  const removeCountry = (code: string) => {
    setAllowedCountries(prev => prev.filter(c => c !== code))
  }

  const submit = (data: CreateLinkForm) => {
    onSubmit({
      slug: data.slug || '',
      destinationUrl: data.destinationUrl,
      domain: data.domain,
      status: data.status,
      allowedDevices,
      allowedCountries,
      botAction,
      safeUrl: botAction === 'safe' ? (data.safeUrl || '') : '',
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-neutral-200 my-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200">
          <h2 className="text-lg font-bold text-slate-900">
            {initialData ? 'Edit Link' : 'Create New Link'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-muted" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(submit)} className="p-6 space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Tracked link slug</label>
                <div className="flex gap-2">
                  <input
                    {...register('slug')}
                    placeholder="Leave empty to auto-generate"
                    className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-black transition-colors"
                  />
                  <div className="flex items-center text-xs text-muted bg-slate-100 rounded-xl px-3">
                    auto-gen
                  </div>
                </div>
                {errors.slug && <p className="text-xs text-error mt-1">{errors.slug.message}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Target Domain</label>
                <select
                  {...register('domain')}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors appearance-none"
                >
                  {domains.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                {errors.domain && <p className="text-xs text-error mt-1">{errors.domain.message}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Destination</label>
              <input
                {...register('destinationUrl')}
                placeholder="https://example.com/your-landing-page"
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
              />
              <p className="text-xs text-muted mt-1.5 leading-relaxed">
                The real page visitors reach after passing checks. Bots and flagged traffic land on
                your page for blocked visitors instead of here.
              </p>
              {errors.destinationUrl && <p className="text-xs text-error mt-1">{errors.destinationUrl.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Status</label>
              <div className="flex gap-3">
                <label className="flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer transition-all">
                  <input type="radio" value="active" {...register('status')} className="hidden peer" />
                  <span className="peer-checked:bg-black peer-checked:text-white peer-checked:border-black bg-neutral-100 text-neutral-500 border-neutral-200 px-4 py-2 rounded-lg text-sm font-bold transition-all">
                    Active
                  </span>
                </label>
                <label className="flex-1 flex items-center justify-center gap-2">
                  <input type="radio" value="paused" {...register('status')} className="hidden peer" />
                  <span className="peer-checked:bg-neutral-200 peer-checked:text-neutral-700 peer-checked:border-neutral-300 bg-neutral-50 text-muted border-neutral-200 px-4 py-2 rounded-lg text-sm font-bold transition-all">
                    Paused
                  </span>
                </label>
              </div>
            </div>
          </div>

          {/* Per-link restrictions */}
          <div className="space-y-4 border-t border-neutral-200 pt-5">
            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Restrict devices</h4>
              <p className="text-xs text-muted mb-3">
                When set, only these device types can reach this link. Leave all unchecked to allow every device.
              </p>
              <div className="flex flex-wrap gap-2">
                {DEVICE_OPTIONS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleDevice(value)}
                    className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-full border transition-all ${
                      allowedDevices.includes(value)
                        ? 'bg-black text-white border-black'
                        : 'bg-neutral-50 text-slate-700 border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Restrict countries</h4>
              <p className="text-xs text-muted mb-3">
                When set, only visitors from these countries can reach this link. Empty = everyone.
              </p>
              {allowedCountries.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {allowedCountries.map(code => (
                    <span key={code} className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-full bg-neutral-100 text-slate-700">
                      <CountryFlag code={code} className="inline-block w-4 h-3 rounded-[2px] overflow-hidden ring-1 ring-neutral-200 shrink-0" />
                      {countryName(code)}
                      <button type="button" onClick={() => removeCountry(code)} className="ml-0.5 text-muted hover:text-error transition-colors">
                        <HugeiconsIcon icon={Cancel01Icon} className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <select
                  value={countryInput}
                  onChange={(e) => setCountryInput(e.target.value)}
                  className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors appearance-none"
                >
                  <option value="">Add a country…</option>
                  {COMMON_COUNTRIES.filter(c => !allowedCountries.includes(c)).map(code => (
                    <option key={code} value={code}>{countryName(code)} ({code})</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => addCountry(countryInput)}
                  className="inline-flex items-center gap-1.5 bg-neutral-900 hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
                >
                  <HugeiconsIcon icon={PlusSignIcon} className="w-4 h-4" />
                  Add
                </button>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-1">Handle bots on this link</h4>
              <p className="text-xs text-muted mb-3">
                How detected bots are treated when they hit this specific link.
              </p>
              <div className="space-y-2">
                {BOT_ACTIONS.map(({ value, label, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setBotAction(value)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      botAction === value ? 'border-black bg-slate-50 ring-1 ring-black' : 'border-neutral-200 hover:border-neutral-400'
                    }`}
                  >
                    <span className={`mt-0.5 w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                      botAction === value ? 'border-black' : 'border-neutral-300'
                    }`}>
                      {botAction === value && <span className="w-2 h-2 rounded-full bg-black" />}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-slate-900">{label}</span>
                      <span className="block text-xs text-muted mt-0.5">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
              {botAction === 'safe' && (
                <div className="mt-3">
                  <input
                    {...register('safeUrl')}
                    placeholder="Custom URL for blocked visitors (optional — leave blank to use your default page for blocked visitors)"
                    className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-black transition-colors"
                  />
                  {errors.safeUrl && <p className="text-xs text-error mt-1">{errors.safeUrl.message}</p>}
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-bold text-muted hover:text-slate-900 transition-colors">
              Cancel
            </button>
            <button type="submit" className="bg-black hover:bg-neutral-800 text-white px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm">
              {initialData ? 'Update Link' : 'Create Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
