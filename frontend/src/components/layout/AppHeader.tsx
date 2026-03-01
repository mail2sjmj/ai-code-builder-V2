import { useSessionStore } from '@/store/sessionStore'
import { truncateId } from '@/utils/formatters'

export function AppHeader() {
  const sessionId = useSessionStore((s) => s.sessionId)
  const env = import.meta.env.MODE

  return (
    <header className="border-b bg-background/95 backdrop-blur-sm shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        {/* Left spacer for visual balance */}
        <div className="w-48 flex items-center gap-2">
          {env !== 'production' && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200">
              {env.toUpperCase()}
            </span>
          )}
        </div>

        {/* Centered Branding */}
        <div className="flex flex-col items-center select-none">
          <h1 className="text-2xl font-extrabold tracking-tight leading-none">
            <span className="bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 bg-clip-text text-transparent">
              Code Genie
            </span>
            <span className="mx-2 text-muted-foreground/50 font-light">—</span>
            <span className="text-foreground">Intelligent Code Studio</span>
          </h1>
          <p className="mt-0.5 text-[11px] font-medium tracking-[0.18em] uppercase text-muted-foreground/70">
            Intelligent · Automated · Precise
          </p>
        </div>

        {/* Right: session info */}
        <div className="w-48 flex items-center justify-end gap-2">
          {sessionId && (
            <div className="flex items-center gap-1.5 rounded-full border bg-muted/50 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
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
