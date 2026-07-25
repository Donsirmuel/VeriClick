import { HugeiconsIcon } from '@hugeicons/react'
import { Notification02Icon, Search01Icon, Menu01Icon, ChevronDownIcon, UserIcon } from '@hugeicons/core-free-icons'

export function TopBar({ onMenuToggle }: { onMenuToggle: () => void }) {
  return (
    <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 md:px-8 shrink-0">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <HugeiconsIcon icon={Menu01Icon} className="w-5 h-5 text-muted" />
        </button>
        
        {/* Breadcrumb */}
        <div className="hidden md:flex items-center gap-2 text-sm">
          <span className="text-muted">Workspace</span>
          <span className="text-muted">/</span>
          <span className="font-medium text-slate-900">VeriClick Pro</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden md:flex items-center gap-2 bg-neutral-100 rounded-lg px-3 py-2 w-64">
          <HugeiconsIcon icon={Search01Icon} className="w-4 h-4 text-neutral-400" />
          <input 
            type="text" 
            placeholder="Search links, domains..." 
            className="bg-transparent border-none text-sm focus:outline-none w-full placeholder:text-muted"
          />
        </div>

        <button className="relative p-2 rounded-lg hover:bg-neutral-100 transition-colors">
          <HugeiconsIcon icon={Notification02Icon} className="w-5 h-5 text-neutral-400" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full" />
        </button>

        <div className="flex items-center gap-3 pl-2 md:border-l md:border-neutral-200 md:pl-4 cursor-pointer hover:bg-neutral-50 rounded-lg px-2 py-1 transition-colors group">
          <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-black">
            <HugeiconsIcon icon={UserIcon} className="w-4 h-4" />
          </div>
          <div className="hidden md:block text-left">
            <div className="text-sm font-bold text-slate-900 leading-none">Operator</div>
            <div className="text-[11px] text-muted leading-none mt-1">admin@vericlick.io</div>
          </div>
          <HugeiconsIcon icon={ChevronDownIcon} className="w-4 h-4 text-neutral-400 group-hover:text-black transition-colors" />
        </div>
      </div>
    </header>
  )
}
