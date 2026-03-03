import { ChevronDown, ChevronRight, FileCode2, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { apiGet } from '@/services/apiClient'
import type { CodeLibraryItem, CodeLibraryListResponse } from '@/types/api.types'

type Visibility = 'public' | 'private'

async function fetchList(visibility: Visibility): Promise<CodeLibraryItem[]> {
  const res = await apiGet<CodeLibraryListResponse>(`/code-library/${visibility}`)
  return res.items
}

export function CodeLibraryPanel() {
  const [publicOpen, setPublicOpen] = useState(false)
  const [privateOpen, setPrivateOpen] = useState(false)
  const [loadingPublic, setLoadingPublic] = useState(false)
  const [loadingPrivate, setLoadingPrivate] = useState(false)
  const [publicItems, setPublicItems] = useState<CodeLibraryItem[]>([])
  const [privateItems, setPrivateItems] = useState<CodeLibraryItem[]>([])

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
    if (!publicOpen) return
    void loadPublic()
  }, [publicOpen])

  useEffect(() => {
    if (!privateOpen) return
    void loadPrivate()
  }, [privateOpen])

  useEffect(() => {
    const handler = () => {
      if (publicOpen) void loadPublic()
      if (privateOpen) void loadPrivate()
    }
    window.addEventListener('code-library-updated', handler)
    return () => window.removeEventListener('code-library-updated', handler)
  }, [publicOpen, privateOpen])

  const renderList = (items: CodeLibraryItem[], loading: boolean) => {
    if (loading) return <div className="py-2 text-xs text-muted-foreground"><Loader2 className="mr-1 inline h-3 w-3 animate-spin" />Loading...</div>
    if (items.length === 0) return <div className="py-2 text-xs text-muted-foreground">No saved codes yet.</div>
    return (
      <ul className="space-y-1 py-1">
        {items.map((it) => (
          <li key={`${it.filename}-${it.updated_at}`} className="truncate rounded border border-border/60 bg-background px-2 py-1 text-[11px] font-mono text-foreground" title={it.filename}>
            {it.filename}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="mt-3 rounded-lg border border-border bg-card/80 p-3">
      <div className="mb-2 flex items-center gap-2">
        <FileCode2 className="h-4 w-4 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Code Library</p>
      </div>

      <div className="space-y-2">
        <div className="rounded-md border border-border/60 bg-background/60">
          <button
            type="button"
            onClick={() => setPublicOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-left"
          >
            <span className="text-xs font-medium text-foreground">Public</span>
            {publicOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {publicOpen && <div className="border-t px-2">{renderList(publicItems, loadingPublic)}</div>}
        </div>

        <div className="rounded-md border border-border/60 bg-background/60">
          <button
            type="button"
            onClick={() => setPrivateOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2 py-1.5 text-left"
          >
            <span className="text-xs font-medium text-foreground">Private</span>
            {privateOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
          </button>
          {privateOpen && <div className="border-t px-2">{renderList(privateItems, loadingPrivate)}</div>}
        </div>
      </div>
    </div>
  )
}
