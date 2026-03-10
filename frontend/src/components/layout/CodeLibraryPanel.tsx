import { ChevronDown, ChevronRight, Loader2, Search, Share2, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { apiGet, apiDelete, apiPost } from '@/services/apiClient'
import { toastError, toastSuccess } from '@/utils/toast'
import { useInstructionStore } from '@/store/instructionStore'
import { useCodeStore } from '@/store/codeStore'
import { useExecutionStore } from '@/store/executionStore'
import { useSessionStore } from '@/store/sessionStore'
import type {
  CodeCacheEntry,
  CodeLibraryContentResponse,
  CodeLibraryItem,
  CodeLibraryListResponse,
  ShareToPublicResponse,
  ShareToUsersRequest,
  ShareToUsersResponse,
} from '@/types/api.types'

type Visibility = 'public' | 'private'

interface ConfirmDelete {
  visibility: Visibility
  filename: string
}

type ShareStep = 'choose' | 'users'

interface ShareDialog {
  filename: string
  step: ShareStep
  userInput: string
  isSubmitting: boolean
}

async function fetchList(visibility: Visibility): Promise<CodeLibraryItem[]> {
  const res = await apiGet<CodeLibraryListResponse>(`/code-library/${visibility}`)
  return res.items
}

export function CodeLibraryPanel() {
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [loadingPublic, setLoadingPublic] = useState(false)
  const [loadingPrivate, setLoadingPrivate] = useState(false)
  const [publicItems, setPublicItems] = useState<CodeLibraryItem[]>([])
  const [privateItems, setPrivateItems] = useState<CodeLibraryItem[]>([])
  const [publicSearch, setPublicSearch] = useState('')
  const [privateSearch, setPrivateSearch] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDelete | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [shareDialog, setShareDialog] = useState<ShareDialog | null>(null)
  const [loadingFunction, setLoadingFunction] = useState<string | null>(null)
  const [activeFunction, setActiveFunction] = useState<string | null>(null)
  const userInputRef = useRef<HTMLTextAreaElement>(null)

  const loadCachedState = useInstructionStore((s) => s.loadCachedState)
  const setGeneratedCode = useCodeStore((s) => s.setGeneratedCode)
  const resetExecution = useExecutionStore((s) => s.reset)
  const setCurrentStep = useSessionStore((s) => s.setCurrentStep)

  const handleLoadFunction = async (filename: string, visibility: Visibility) => {
    const label = filename.replace(/\.py$/, '')
    setGeneratedCode('')  // resets code + increments loadKey so Monaco remounts cleanly
    resetExecution()
    setLoadingFunction(filename)
    try {
      // Try cache with the auto-saved instruction label pattern first, then bare label
      let cache: CodeCacheEntry | null = null
      for (const key of [`${label}_instr`, label]) {
        try {
          cache = await apiGet<CodeCacheEntry>(`/code-cache/${encodeURIComponent(key)}`)
          break
        } catch {
          // not found, try next key
        }
      }

      if (cache) {
        loadCachedState(cache.raw_instructions, cache.refined_prompt, cache.label)
        setGeneratedCode(cache.code)
        setCurrentStep(2)
        setActiveFunction(filename)
        toastSuccess(`"${label}" loaded — execute to run with your dataset.`)
      } else {
        // No cache: load just the code so user can still execute
        const content = await apiGet<CodeLibraryContentResponse>(
          `/code-library/${visibility}/${encodeURIComponent(filename)}/content`,
        )
        setGeneratedCode(content.code)
        setCurrentStep(2)
        useInstructionStore.getState().setIsFromCache(true)
        setActiveFunction(filename)
        toastSuccess(`"${label}" loaded — no cached instructions found.`)
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to load function.')
    } finally {
      setLoadingFunction(null)
    }
  }

  const loadPublic = async () => {
    setLoadingPublic(true)
    try {
      setPublicItems(await fetchList('public'))
    } catch {
      setPublicItems([])
    } finally {
      setLoadingPublic(false)
    }
  }

  const loadPrivate = async () => {
    setLoadingPrivate(true)
    try {
      setPrivateItems(await fetchList('private'))
    } catch {
      setPrivateItems([])
    } finally {
      setLoadingPrivate(false)
    }
  }

  useEffect(() => {
    if (!libraryOpen) return
    void loadPublic()
    void loadPrivate()
  }, [libraryOpen])

  useEffect(() => {
    const handler = () => {
      if (libraryOpen) {
        void loadPublic()
        void loadPrivate()
      }
    }
    window.addEventListener('code-library-updated', handler)
    return () => window.removeEventListener('code-library-updated', handler)
  }, [libraryOpen])

  const handleDelete = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      await apiDelete(`/code-library/${confirmDelete.visibility}/${encodeURIComponent(confirmDelete.filename)}`)
      toastSuccess('Code deleted from library.')
      setConfirmDelete(null)
      if (confirmDelete.visibility === 'public') {
        void loadPublic()
      } else {
        void loadPrivate()
      }
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to delete code.')
    } finally {
      setIsDeleting(false)
    }
  }

  const openShareDialog = (filename: string) => {
    setShareDialog({ filename, step: 'choose', userInput: '', isSubmitting: false })
  }

  const closeShareDialog = () => setShareDialog(null)

  const handleSharePublic = async () => {
    if (!shareDialog) return
    setShareDialog((d) => d && { ...d, isSubmitting: true })
    try {
      await apiPost<ShareToPublicResponse>(
        `/code-library/private/${encodeURIComponent(shareDialog.filename)}/share-public`,
        {},
      )
      toastSuccess(`"${shareDialog.filename}" shared to public library.`)
      closeShareDialog()
      void loadPublic()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to share to public.')
      setShareDialog((d) => d && { ...d, isSubmitting: false })
    }
  }

  const handleShareUsers = async () => {
    if (!shareDialog) return
    const ids = shareDialog.userInput.split(',').map((s) => s.trim()).filter(Boolean)
    if (ids.length === 0) {
      toastError('Please enter at least one user ID.')
      return
    }
    setShareDialog((d) => d && { ...d, isSubmitting: true })
    try {
      const res = await apiPost<ShareToUsersResponse>(
        `/code-library/private/${encodeURIComponent(shareDialog.filename)}/share-users`,
        { user_ids: ids } satisfies ShareToUsersRequest,
      )
      toastSuccess(`"${shareDialog.filename}" shared with: ${res.shared_to.join(', ')}`)
      closeShareDialog()
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to share with users.')
      setShareDialog((d) => d && { ...d, isSubmitting: false })
    }
  }

  const renderList = (items: CodeLibraryItem[], loading: boolean, query: string, visibility: Visibility) => {
    if (loading) return (
      <div className="py-2 text-xs text-muted-foreground">
        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Loading...
      </div>
    )
    const filtered = query.trim()
      ? items.filter((it) => it.filename.toLowerCase().includes(query.toLowerCase()))
      : items
    if (filtered.length === 0) return (
      <div className="py-2 text-xs text-muted-foreground">
        {items.length === 0 ? 'No saved codes yet.' : 'No matches found.'}
      </div>
    )
    return (
      <ul className="space-y-1 py-1">
        {filtered.map((it) => {
          const isPendingDelete = confirmDelete?.visibility === visibility && confirmDelete?.filename === it.filename
          const isActive = activeFunction === it.filename
          const isLoadingThis = loadingFunction === it.filename
          return (
            <li key={`${it.filename}-${it.updated_at}`} className="group">
              {isPendingDelete ? (
                <div className="rounded border border-amber-300 bg-amber-50 px-2 py-2">
                  <p className="mb-1.5 text-[10px] font-semibold text-amber-800">Delete this code?</p>
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
                  className={`flex items-center justify-between rounded border px-2 py-1 ${
                    isActive
                      ? 'border-primary bg-primary/5'
                      : 'border-border bg-white hover:bg-slate-50'
                  }`}
                  title={it.filename}
                >
                  <button
                    type="button"
                    onClick={() => void handleLoadFunction(it.filename, visibility)}
                    disabled={!!loadingFunction}
                    className="min-w-0 flex-1 text-left"
                    title={`Load "${it.filename}" into workspace`}
                  >
                    <span className={`truncate block text-[11px] ${isActive ? 'font-semibold text-primary' : 'text-foreground'}`}>
                      {isLoadingThis ? (
                        <><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />{it.filename}</>
                      ) : it.filename}
                    </span>
                  </button>
                  <div className="ml-1 flex shrink-0 items-center gap-0.5">
                    {visibility === 'private' && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openShareDialog(it.filename) }}
                        className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-blue-50 hover:text-blue-600 transition-opacity"
                        title="Share"
                      >
                        <Share2 className="h-3 w-3" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete({ visibility, filename: it.filename }) }}
                      className="rounded p-0.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 transition-opacity"
                      title="Delete"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Code Library collapsible header */}
      <button
        type="button"
        onClick={() => setLibraryOpen((v) => !v)}
        className="flex w-full items-center justify-between border-l-2 border-l-primary rounded-r border border-l-0 border-border bg-slate-100 px-3 py-2 text-left text-slate-700 transition-colors hover:bg-slate-200"
        aria-expanded={libraryOpen}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-700">Functions Library</span>
        {libraryOpen ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
      </button>

      {libraryOpen && (
        <div className="space-y-3 px-1">

          {/* Public section */}
          <div>
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Public
            </p>
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={publicSearch}
                onChange={(e) => setPublicSearch(e.target.value)}
                placeholder="Search public..."
                className="w-full rounded border border-border bg-white py-1 pl-6 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="h-36 overflow-y-auto rounded border border-border bg-white px-2 py-1">
              {renderList(publicItems, loadingPublic, publicSearch, 'public')}
            </div>
          </div>

          {/* Private section */}
          <div>
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Private
            </p>
            <div className="relative mb-1.5">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={privateSearch}
                onChange={(e) => setPrivateSearch(e.target.value)}
                placeholder="Search private..."
                className="w-full rounded border border-border bg-white py-1 pl-6 pr-2 text-[11px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="h-36 overflow-y-auto rounded border border-border bg-white px-2 py-1">
              {renderList(privateItems, loadingPrivate, privateSearch, 'private')}
            </div>
          </div>

        </div>
      )}

      {/* Share Dialog */}
      {shareDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={(e) => { if (e.target === e.currentTarget) closeShareDialog() }}
        >
          <div className="relative w-80 rounded-lg border border-border bg-white p-5 shadow-xl">
            <button
              type="button"
              onClick={closeShareDialog}
              className="absolute right-3 top-3 rounded p-0.5 text-muted-foreground hover:bg-slate-100 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>

            <p className="mb-0.5 text-[11px] text-muted-foreground">Share function</p>
            <p className="mb-4 truncate text-sm font-semibold text-foreground" title={shareDialog.filename}>
              {shareDialog.filename}
            </p>

            {shareDialog.step === 'choose' && (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={shareDialog.isSubmitting}
                  onClick={() => void handleSharePublic()}
                  className="flex w-full items-center gap-2 rounded border border-border px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <Share2 className="h-4 w-4 shrink-0 text-blue-500" />
                  <span>Share as Public Function</span>
                </button>
                <button
                  type="button"
                  disabled={shareDialog.isSubmitting}
                  onClick={() => {
                    setShareDialog((d) => d && { ...d, step: 'users' })
                    setTimeout(() => userInputRef.current?.focus(), 50)
                  }}
                  className="flex w-full items-center gap-2 rounded border border-border px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <Share2 className="h-4 w-4 shrink-0 text-violet-500" />
                  <span>Share to Specific Users</span>
                </button>
              </div>
            )}

            {shareDialog.step === 'users' && (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[11px] font-medium text-muted-foreground">
                    User IDs <span className="font-normal">(comma-separated)</span>
                  </label>
                  <textarea
                    ref={userInputRef}
                    rows={3}
                    value={shareDialog.userInput}
                    onChange={(e) => setShareDialog((d) => d && { ...d, userInput: e.target.value })}
                    placeholder="user123, alice, bob"
                    className="w-full resize-none rounded border border-border bg-white px-2.5 py-1.5 text-[12px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    disabled={shareDialog.isSubmitting}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShareDialog((d) => d && { ...d, step: 'choose', userInput: '' })}
                    disabled={shareDialog.isSubmitting}
                    className="flex-1 rounded border border-border px-3 py-1.5 text-[12px] font-medium text-muted-foreground hover:bg-slate-50 disabled:opacity-50"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleShareUsers()}
                    disabled={shareDialog.isSubmitting || !shareDialog.userInput.trim()}
                    className="flex-1 rounded bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {shareDialog.isSubmitting ? 'Sharing...' : 'Share'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
