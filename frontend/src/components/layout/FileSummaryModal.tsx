import { useEffect, useState } from 'react'
import { X, Loader2, Eye } from 'lucide-react'
import { apiGet } from '@/services/apiClient'
import type { FileSummaryResponse, ColumnSummary, ColumnValuesResponse } from '@/types/api.types'
import { cn } from '@/lib/utils'

interface FileSummaryModalProps {
  sessionId: string
  filename: string
  onClose: () => void
}

const STAT_COLS_LEFT = [
  { key: 'record_count',      label: 'Record Count' },
  { key: 'null_count',        label: 'Null Count' },
  { key: 'count_with_values', label: 'Count w/ Values' },
  { key: 'unique_count',      label: 'Unique Count' },
] as const

const STAT_COLS_RIGHT = [
  { key: 'is_key_column', label: 'Is Key Column' },
  { key: 'min_value',     label: 'Min Value' },
  { key: 'max_value',     label: 'Max Value' },
] as const

type StatKeyLeft  = (typeof STAT_COLS_LEFT)[number]['key']
type StatKeyRight = (typeof STAT_COLS_RIGHT)[number]['key']
type StatKey = StatKeyLeft | StatKeyRight

function getCellValue(row: ColumnSummary, key: StatKey): string {
  const val = row[key]
  if (val === null || val === undefined) return '—'
  return String(val)
}

function getCellClass(row: ColumnSummary, key: StatKey): string {
  if (key === 'is_key_column') {
    return row.is_key_column === 'Yes' ? 'text-green-600 font-semibold' : 'text-muted-foreground'
  }
  if (key === 'null_count' && row.null_count > 0) return 'text-amber-600'
  return ''
}

// ── Values slide-in panel ────────────────────────────────────────────────────

interface ValuesPanelProps {
  sessionId: string
  column: ColumnSummary
  onClose: () => void
}

function ValuesPanel({ sessionId, column, onClose }: ValuesPanelProps) {
  const [values, setValues]     = useState<string[]>([])
  const [isSample, setIsSample] = useState(false)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    apiGet<ColumnValuesResponse>(
      `/session/${sessionId}/column-values?column=${encodeURIComponent(column.column)}`,
    )
      .then((r) => { setValues(r.values); setIsSample(r.is_sample) })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load values.'))
      .finally(() => setLoading(false))
  }, [sessionId, column.column])

  return (
    <div className="flex w-64 shrink-0 flex-col border-l border-border bg-slate-50 animate-in slide-in-from-right duration-200">
      {/* Panel header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-slate-100 px-3 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-foreground" title={column.column}>
            {column.column}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {isSample ? '5 random samples' : `${values.length} unique value${values.length !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Panel body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && (
          <div className="flex h-24 items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading…
          </div>
        )}
        {error && (
          <p className="px-3 py-4 text-xs text-destructive">{error}</p>
        )}
        {!loading && !error && (
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100">
              <tr>
                <th className="border-b border-border px-3 py-1.5 text-left font-semibold text-muted-foreground">
                  {column.column}
                </th>
              </tr>
            </thead>
            <tbody>
              {values.map((v, i) => (
                <tr key={i} className={cn('border-b border-border/40', i % 2 === 0 ? 'bg-white' : 'bg-slate-50/60')}>
                  <td className="px-3 py-1.5 text-foreground break-all">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isSample && (
        <div className="shrink-0 border-t border-border px-3 py-2">
          <p className="text-[10px] text-amber-600">
            Showing 5 random samples — {column.unique_count} unique values exist
          </p>
        </div>
      )}
    </div>
  )
}

// ── Main modal ───────────────────────────────────────────────────────────────

export function FileSummaryModal({ sessionId, filename, onClose }: FileSummaryModalProps) {
  const [summary, setSummary]           = useState<FileSummaryResponse | null>(null)
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState<string | null>(null)
  const [activeColumn, setActiveColumn] = useState<ColumnSummary | null>(null)

  useEffect(() => {
    setLoading(true)
    apiGet<FileSummaryResponse>(`/session/${sessionId}/summary`)
      .then(setSummary)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Failed to load summary.'))
      .finally(() => setLoading(false))
  }, [sessionId])

  const handleEye = (row: ColumnSummary) => {
    setActiveColumn((prev) => (prev?.column === row.column ? null : row))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="flex w-full flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
        style={{ maxWidth: activeColumn ? '72rem' : '56rem', maxHeight: '85vh' }}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">File Summary</h2>
            <p className="text-xs text-muted-foreground">{filename}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body: summary table + optional values panel side-by-side */}
        <div className="flex min-h-0 flex-1 overflow-hidden">

          {/* Summary table */}
          <div className="min-h-0 flex-1 overflow-auto">
            {loading && (
              <div className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading summary…
              </div>
            )}

            {error && (
              <div className="flex h-48 items-center justify-center text-sm text-destructive">
                {error}
              </div>
            )}

            {summary && (
              <table className="w-full border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100">
                  <tr>
                    <th className="border-b border-border px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Column</th>
                    <th className="border-b border-border px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Type</th>
                    {STAT_COLS_LEFT.map((col) => (
                      <th key={col.key} className="border-b border-border px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                    <th className="border-b border-border px-3 py-2 text-center font-semibold text-muted-foreground whitespace-nowrap">Values</th>
                    {STAT_COLS_RIGHT.map((col) => (
                      <th key={col.key} className="border-b border-border px-3 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.columns.map((row, i) => (
                    <tr key={row.column}
                        className={cn('border-b border-border/50', i % 2 === 0 ? 'bg-background' : 'bg-slate-50/60',
                          activeColumn?.column === row.column && 'ring-1 ring-inset ring-primary/30 bg-primary/5')}>
                      <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{row.column}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{row.dtype}</td>
                      {STAT_COLS_LEFT.map((col) => (
                        <td key={col.key}
                            className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', getCellClass(row, col.key))}>
                          {getCellValue(row, col.key)}
                        </td>
                      ))}
                      {/* Values eye icon */}
                      <td className="px-3 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleEye(row)}
                          className={cn(
                            'rounded p-1 transition-colors',
                            activeColumn?.column === row.column
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                          title={`View values for ${row.column}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                      </td>
                      {STAT_COLS_RIGHT.map((col) => (
                        <td key={col.key}
                            className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap', getCellClass(row, col.key))}>
                          {getCellValue(row, col.key)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Values slide-in panel */}
          {activeColumn && (
            <ValuesPanel
              sessionId={sessionId}
              column={activeColumn}
              onClose={() => setActiveColumn(null)}
            />
          )}
        </div>

        {/* Footer */}
        {summary && (
          <div className="shrink-0 border-t border-border px-5 py-2">
            <p className="text-[11px] text-muted-foreground">
              {summary.columns.length} columns &nbsp;·&nbsp; {summary.columns[0]?.record_count.toLocaleString()} rows
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
