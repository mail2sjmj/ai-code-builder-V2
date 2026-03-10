import { useSessionStore } from '@/store/sessionStore'
import { truncateId } from '@/utils/formatters'

export function AppHeader() {
  const sessionId = useSessionStore((s) => s.sessionId)
  const env = import.meta.env.MODE

  return (
    <header className="border-b bg-white shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* Left: env badge */}
        <div className="w-48 flex items-center gap-2">
          {env !== 'production' && (
            <span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              {env.toUpperCase()}
            </span>
          )}
        </div>

        {/* Center: Branding */}
        <div className="flex flex-col items-center select-none">
          <h1 className="text-xl font-bold tracking-tight leading-none text-foreground">
            <span className="text-[#C4922A]">Code Genie</span>
            <span className="mx-2 text-border font-light">|</span>
            <span className="text-foreground font-semibold">AI Code Builder</span>
          </h1>
          <p className="mt-1 text-[11px] font-medium tracking-[0.14em] uppercase text-muted-foreground">
            Intelligent · Automated · Precise
          </p>
        </div>

        {/* Right: session info */}
        <div className="w-48 flex items-center justify-end gap-2">
          {sessionId && (
            <div className="flex items-center gap-1.5 rounded border border-border bg-slate-50 px-2.5 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="font-mono text-[11px] text-muted-foreground">
                {truncateId(sessionId)}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
