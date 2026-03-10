import { ChevronDown, ChevronRight, Loader2, Search, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiDelete, apiGet } from '@/services/apiClient'
import { useInstructionStore } from '@/store/instructionStore'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { toastError, toastSuccess } from '@/utils/toast'
import type { CodeCacheEntry, InstructionLibraryItem, InstructionLibraryListResponse } from '@/types/api.types'

async function fetchList(): Promise<InstructionLibraryItem[]> {
  const res = await apiGet<InstructionLibraryListResponse>('/instructions-library/list')
  return res.items
}

export function InstructionsLibraryPanel() {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<InstructionLibraryItem[]>([])
  const [search, setSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const setRawInstructions = useInstructionStore((s) => s.setRawInstructions)
  const resetRefined = useInstructionStore((s) => s.resetRefined)
  const setActiveSavedLabel = useInstructionStore((s) => s.setActiveSavedLabel)
  const loadCachedState = useInstructionStore((s) => s.loadCachedState)
  const setGeneratedCode = useCodeStore((s) => s.setGeneratedCode)
  const resetCode = useCodeStore((s) => s.resetCode)
  const resetExecution = useExecutionStore((s) => s.reset)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await fetchList())
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!libraryOpen) return
    void load()
  }, [libraryOpen])

  useEffect(() => {
    const handler = () => { if (libraryOpen) void load() }
    window.addEventListener('instructions-library-updated', handler)
    return () => window.removeEventListener('instructions-library-updated', handler)
  }, [libraryOpen])

  const handleLoad = async (filename: string) => {
    resetCode()
    resetExecution()
    try {
      const res = await apiGet<{ filename: string; instruction: string }>(
        `/instructions-library/${encodeURIComponent(filename)}`,
      )
      // Derive cache label from filename (strip .txt)
      const label = filename.replace(/\.txt$/, '')

      // Check if there is cached code for these instructions
      try {
        const cached = await apiGet<CodeCacheEntry>(`/code-cache/${encodeURIComponent(label)}`)
        // Atomic update: sets rawInstructions + refinedPrompt + isFromCache:true + activeSavedLabel
        // in one store write — prevents the isFromCache:false intermediate state that would
        // cause Execute to regenerate code instead of using the cache.
        loadCachedState(res.instruction, cached.refined_prompt, label)
        setGeneratedCode(cached.code)
        toastSuccess('Instruction loaded with saved code — ready to execute directly.')
      } catch {
        // No cache — set instruction and clear stale refined prompt so Generate Code
        // will use the new instruction's prompt instead of the previous one.
        setRawInstructions(res.instruction)
        setActiveSavedLabel(label)
        resetRefined()
        toastSuccess('Instruction loaded into panel.')
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to load instruction.')
    }
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await apiDelete(`/instructions-library/${encodeURIComponent(confirmDelete)}`)
      toastSuccess('Instruction deleted.')
      setConfirmDelete(null)
      void load()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete instruction.')
    } finally {
      setIsDeleting(false)
    }
  }

  const filtered = search.trim()
    ? items.filter((it) => it.filename.toLowerCase().includes(search.toLowerCase()))
    : items

  return (
    <div className="mt-2 space-y-2">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setLibraryOpen((v) => !v)}
        className="flex w-full items-center justify-between border-l-2 border-l-primary rounded-r border border-l-0 border-border bg-slate-100 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-200"
        aria-expanded={libraryOpen}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Instructions Library</span>
        {libraryOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
      </button>

      {libraryOpen && (
        <div className="px-1 space-y-2">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search instructions..."
              className="w-full rounded border border-border bg-white py-1 pl-6 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* List */}
          <div className="h-40 overflow-y-auto rounded border border-border bg-white px-2 py-1">
            {loading ? (
              <div className="py-2 text-xs text-muted-foreground">
                <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-2 text-xs text-muted-foreground">
                {items.length === 0 ? 'No saved instructions yet.' : 'No matches found.'}
              </div>
            ) : (
              <ul className="space-y-1 py-1">
                {filtered.map((it) => (
                  <li key={`${it.filename}-${it.updated_at}`} className="group">
                    {confirmDelete === it.filename ? (
                      <div className="rounded border border-amber-300 bg-amber-50 px-2 py-2">
                        <p className="mb-1.5 text-[10px] font-semibold text-amber-800">Delete this instruction?</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => void handleDelete()}
                            disabled={isDeleting}
                            className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {isDeleting ? 'Deleting...' : 'Yes, Delete'}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            disabled={isDeleting}
                            className="rounded border border-amber-400 px-2 py-0.5 text-[10px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex items-center justify-between rounded border border-border bg-white px-2 py-1 hover:bg-slate-50 cursor-pointer"
                        title={it.filename}
                        onClick={() => void handleLoad(it.filename)}
                      >
                        <span className="truncate text-[11px] text-foreground">{it.filename.replace(/\.txt$/, '')}</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(it.filename) }}
                          className="ml-1 shrink-0 rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-opacity"
                          title="Delete"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
