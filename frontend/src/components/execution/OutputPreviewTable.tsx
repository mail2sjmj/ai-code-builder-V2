import { useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, X } from 'lucide-react'
import { useExecutionStore } from '@/store/executionStore'
import { formatRowCount } from '@/utils/formatters'
import appConfig from '@/config/app.config'

const PAGE_SIZE_OPTIONS = [5, 10, 20, 25, 50] as const

export function OutputPreviewTable() {
  const { previewRows, previewColumns, status } = useExecutionStore()
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({})

  if (status !== 'success' && status !== 'running') return null

  if (status === 'running') {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground animate-pulse">
        Executing code…
      </div>
    )
  }

  if (previewRows.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        No output rows to preview.
      </div>
    )
  }

  const activeFilterCount = Object.values(columnFilters).filter(Boolean).length

  const filteredRows = previewRows.filter((row) =>
    previewColumns.every((col) => {
      const filter = columnFilters[col]?.toLowerCase().trim()
      if (!filter) return true
      return String(row[col] ?? '').toLowerCase().includes(filter)
    }),
  )

  const totalRows = filteredRows.length
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
  const safePage = Math.min(page, totalPages)
  const startIdx = (safePage - 1) * pageSize
  const visibleRows = filteredRows.slice(startIdx, startIdx + pageSize)

  const handlePageSize = (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
  }

  const setFilter = (col: string, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [col]: value }))
    setPage(1)
  }

  const clearFilters = () => {
    setColumnFilters({})
    setPage(1)
  }

  const toggleFilters = () => {
    setFiltersOpen((v) => {
      if (v) clearFilters()
      return !v
    })
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      {/* Filter toolbar */}
      <div className="flex items-center justify-between border-b bg-muted/10 px-3 py-1.5">
        <span className="text-xs text-muted-foreground">
          {activeFilterCount > 0
            ? `${formatRowCount(filteredRows.length)} of ${formatRowCount(previewRows.length)} rows`
            : `${formatRowCount(previewRows.length)} rows`}
        </span>
        <div className="flex items-center gap-1.5">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          )}
          <button
            type="button"
            onClick={toggleFilters}
            className={`flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-medium transition-colors ${
              filtersOpen
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-white text-muted-foreground hover:border-primary hover:text-primary'
            }`}
          >
            <Filter className="h-3 w-3" />
            Filter
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted">
            <tr>
              {previewColumns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap border-b px-3 py-2 text-left font-medium text-muted-foreground"
                >
                  {col}
                </th>
              ))}
            </tr>
            {filtersOpen && (
              <tr className="bg-slate-50">
                {previewColumns.map((col) => (
                  <th key={col} className="border-b px-2 py-1">
                    <div className="relative">
                      <input
                        type="text"
                        value={columnFilters[col] ?? ''}
                        onChange={(e) => setFilter(col, e.target.value)}
                        placeholder="Filter…"
                        className="w-full min-w-[80px] rounded border border-border bg-white px-2 py-0.5 pr-5 text-[11px] font-normal text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      {columnFilters[col] && (
                        <button
                          type="button"
                          onClick={() => setFilter(col, '')}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={previewColumns.length}
                  className="px-3 py-6 text-center text-xs text-muted-foreground"
                >
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              visibleRows.map((row, i) => (
                <tr key={startIdx + i} className="border-b last:border-0 hover:bg-muted/30">
                  {previewColumns.map((col) => (
                    <td key={col} className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                      {String(row[col] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex items-center justify-between border-t bg-muted/10 px-3 py-2">
        {/* Left: page size selector */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            of up to {appConfig.preview.rowCount} rows
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => handlePageSize(Number(e.target.value))}
              className="rounded border border-border bg-white px-1.5 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {PAGE_SIZE_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right: page navigation */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage === 1}
            className="flex h-6 w-6 items-center justify-center rounded border border-border bg-white text-foreground hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage === totalPages}
            className="flex h-6 w-6 items-center justify-center rounded border border-border bg-white text-foreground hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
