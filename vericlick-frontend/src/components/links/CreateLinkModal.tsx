// import React from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { TrackingLink, LinkCreateInput } from '@/types'

const createLinkSchema = z.object({
  slug: z.string().min(0).max(50).optional().or(z.literal('')),
  destinationUrl: z.string().url('Must be a valid URL'),
  domain: z.string().min(1, 'Select a domain'),
  status: z.enum(['active', 'paused']),
})

type CreateLinkForm = z.infer<typeof createLinkSchema>

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
    } : {
      slug: '',
      destinationUrl: '',
      domain: domains[0] || '',
      status: 'active' as 'active' | 'paused',
    }
  })

  // const [activeTab, setActiveTab] = useState<'create' | 'edit'>(initialData ? 'edit' : 'create')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-neutral-200">
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
        <form onSubmit={handleSubmit((data) => onSubmit(data as unknown as LinkCreateInput))} className="p-6 space-y-5">
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
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              This becomes the URL you share — the tracked link VeriClick checks every visitor on.
            </p>
            {errors.slug && <p className="text-xs text-error mt-1">{errors.slug.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Destination</label>
            <input 
              {...register('destinationUrl')}
              placeholder="https://example.com/your-landing-page"
              className="w-full bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-black transition-colors"
            />
            <p className="text-xs text-muted mt-1.5 leading-relaxed">
              The real page visitors reach after passing checks. Suspicious traffic is sent to your
              safe destination instead of here.
            </p>
            {errors.destinationUrl && <p className="text-xs text-error mt-1">{errors.destinationUrl.message}</p>}
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
