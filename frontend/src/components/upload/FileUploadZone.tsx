import { useEffect, useRef, useState, type DragEvent } from 'react'
import { CheckCircle2, Clock, FileSpreadsheet, HelpCircle, UploadCloud, X } from 'lucide-react'
import appConfig from '@/config/app.config'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useSessionStore } from '@/store/sessionStore'
import { validateFile } from '@/utils/fileValidation'
import { toastError, toastSuccess } from '@/utils/toast'
import { cn } from '@/lib/utils'
import type { MetadataPreviewResponse } from '@/types/api.types'

type FileWithDataMetaMode = 'file-including-metadata' | 'data-file-excluding-metadata' | 'only-metadata'

// ── Shared toggle switch ──────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        checked ? 'bg-primary' : 'bg-input',
      )}
    >
      <span
        className={cn(
          'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200',
          checked ? 'translate-x-5' : 'translate-x-0',
        )}
      />
    </button>
  )
}

// ── Reusable drop zone box ────────────────────────────────────────────────────

type DropZoneStatus = 'idle' | 'waiting' | 'ready' | 'uploading'

function DropZoneBox({
  label,
  onFile,
  status = 'idle',
  uploadProgress = 0,
  selectedFile,
  compact = false,
}: {
  label: string
  onFile: (file: File) => void
  status?: DropZoneStatus
  uploadProgress?: number
  selectedFile?: File | null
  compact?: boolean
}) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDisabled = status === 'uploading'

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && !isDisabled) onFile(file)
  }

  return (
    <div className="flex flex-col gap-2">
      {label && <p className="text-xs font-semibold text-foreground">{label}</p>}

      <div
        onDrop={onDrop}
        onDragOver={(e) => { e.preventDefault(); if (!isDisabled) setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => !isDisabled && inputRef.current?.click()}
        className={cn(
          'relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200',
          compact ? 'gap-2 p-5' : 'gap-3 p-8',
          isDragging
            ? 'scale-[1.01] border-primary bg-primary/5'
            : status === 'ready'
              ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
              : status === 'waiting'
                ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/20'
                : 'border-border hover:border-primary/50 hover:bg-muted/30',
          isDisabled && 'pointer-events-none opacity-70',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
          }}
        />

        {status === 'uploading' ? (
          <div className="flex w-full max-w-xs flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">Uploading… {uploadProgress}%</p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        ) : selectedFile ? (
          <>
            {status === 'ready' ? (
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            ) : status === 'waiting' ? (
              <Clock className="h-10 w-10 text-amber-500" />
            ) : (
              <FileSpreadsheet className="h-10 w-10 text-green-600" />
            )}
            <p className="max-w-full truncate text-sm font-medium text-foreground">
              {selectedFile.name}
            </p>
            {status === 'waiting' && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Waiting for meta file…
              </p>
            )}
            {status !== 'waiting' && (
              <p className="text-xs text-muted-foreground">Click or drop to replace</p>
            )}
          </>
        ) : (
          <>
            <UploadCloud
              className={cn(compact ? 'h-8 w-8' : 'h-10 w-10', isDragging ? 'text-primary' : 'text-muted-foreground')}
            />
            <p className={cn('text-center font-medium', compact ? 'text-xs leading-snug' : 'text-sm')}>
              {compact ? 'Drop CSV or XLSX here' : 'Drop a CSV or XLSX file here'}
              <br />
              <span className="text-muted-foreground">or click to browse</span>
            </p>
            <p className={cn('text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>Maximum file size: 50 MB</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function FileUploadZone() {
  const [showHelp, setShowHelp] = useState(false)
  const [helpPopupPos, setHelpPopupPos] = useState<{ top: number; left: number; pointerTop: number } | null>(null)
  const helpBtnRef = useRef<HTMLButtonElement | null>(null)
  const [fileWithDataMetaMode, setFileWithDataMetaMode] = useState<FileWithDataMetaMode>('file-including-metadata')
  const [headerPosition, setHeaderPosition] = useState('1')
  const [dataFile, setDataFile] = useState<File | null>(null)
  const [metaFile, setMetaFile] = useState<File | null>(null)
  const [metadataOnlyFile, setMetadataOnlyFile] = useState<File | null>(null)
  const [sampleRowCount, setSampleRowCount] = useState(String(appConfig.upload.metadataSampleDefaultRows))
  const [isGeneratingSample, setIsGeneratingSample] = useState(false)
  const [isPreviewingMetadata, setIsPreviewingMetadata] = useState(false)
  const [sampleDownloadUrl, setSampleDownloadUrl] = useState<string | null>(null)
  const [sampleDownloadName, setSampleDownloadName] = useState('metadata_sample.csv')
  const [sampleGenerated, setSampleGenerated] = useState(false)

  const { uploadFile, uploadFileAsync, isPending, uploadProgress } = useFileUpload()
  const setFileMetadata = useSessionStore((s) => s.setFileMetadata)

  useEffect(() => {
    return () => {
      if (sampleDownloadUrl) URL.revokeObjectURL(sampleDownloadUrl)
    }
  }, [sampleDownloadUrl])

  const resolveHeaderRow = (): number | undefined => {
    const n = parseInt(headerPosition, 10)
    return Number.isFinite(n) && n >= 1 ? n : 1
  }

  // Called when the data file is dropped/selected
  const handleDataFile = (file: File) => {
    const validation = validateFile(file)
    if (!validation.valid) { toastError(validation.error ?? 'Invalid file.'); return }

    if (fileWithDataMetaMode === 'data-file-excluding-metadata') {
      // Store and wait; if meta is already ready, process immediately
      setDataFile(file)
      if (metaFile) uploadFile({ file, metaFile })
    } else {
      uploadFile({ file, headerRow: resolveHeaderRow() })
    }
  }

  // Called when the meta file is dropped/selected
  const handleMetaFile = (file: File) => {
    const validation = validateFile(file)
    if (!validation.valid) { toastError(validation.error ?? 'Invalid file.'); return }

    setMetaFile(file)
    // If data file is already staged, both are ready — process now
    if (dataFile) uploadFile({ file: dataFile, metaFile: file })
  }

  const handleMetadataOnlyFile = async (file: File) => {
    const validation = validateFile(file)
    if (!validation.valid) { toastError(validation.error ?? 'Invalid file.'); return }
    setMetadataOnlyFile(file)
    setSampleGenerated(false)
    if (sampleDownloadUrl) {
      URL.revokeObjectURL(sampleDownloadUrl)
      setSampleDownloadUrl(null)
    }
    setSampleDownloadName('metadata_sample.csv')
    setIsPreviewingMetadata(true)
    try {
      const formData = new FormData()
      formData.append('meta_file', file)
      const response = await fetch(
        `${appConfig.api.baseUrl}${appConfig.api.prefix}/upload/metadata-preview`,
        { method: 'POST', body: formData },
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string }
        throw new Error(body.message ?? `Failed to parse metadata: HTTP ${response.status}`)
      }
      const data = (await response.json()) as MetadataPreviewResponse
      setFileMetadata({
        filename: data.filename,
        rowCount: 0,
        columnCount: data.column_count,
        columns: data.columns,
        dtypes: data.dtypes,
        fileSizeBytes: data.file_size_bytes,
      })
      toastSuccess(`Metadata loaded: ${data.column_count} columns`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to parse metadata.')
    } finally {
      setIsPreviewingMetadata(false)
    }
  }

  const requestSampleData = async (format: 'csv' | 'xlsx'): Promise<{ blob: Blob; filename: string }> => {
    if (!metadataOnlyFile) throw new Error('Select a metadata file first.')
    const rowCount = parseInt(sampleRowCount, 10)
    const maxRows = appConfig.upload.metadataSampleMaxRows
    if (!Number.isFinite(rowCount) || rowCount < 1 || rowCount > maxRows) {
      throw new Error(`Row count must be between 1 and ${maxRows}.`)
    }
    const formData = new FormData()
    formData.append('meta_file', metadataOnlyFile)
    formData.append('row_count', String(rowCount))
    formData.append('output_format', format)

    const response = await fetch(
      `${appConfig.api.baseUrl}${appConfig.api.prefix}/upload/metadata-sample`,
      { method: 'POST', body: formData },
    )
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      throw new Error(body.message ?? `Failed to generate sample data: HTTP ${response.status}`)
    }

    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') ?? ''
    const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i)
    const filename = filenameMatch?.[1]?.trim() || `metadata_sample_${rowCount}.${format}`
    return { blob, filename }
  }

  const generateSampleData = async () => {
    if (!metadataOnlyFile || isGeneratingSample) return
    setIsGeneratingSample(true)
    try {
      const { blob, filename } = await requestSampleData('csv')
      const generatedFile = new File([blob], filename, { type: 'text/csv' })
      await uploadFileAsync({ file: generatedFile, headerRow: 1 })
      if (sampleDownloadUrl) URL.revokeObjectURL(sampleDownloadUrl)
      const objectUrl = URL.createObjectURL(blob)
      setSampleDownloadUrl(objectUrl)
      setSampleDownloadName(filename)
      setSampleGenerated(true)
      toastSuccess('Sample CSV generated and set as active input file.')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to generate sample data.')
    } finally {
      setIsGeneratingSample(false)
    }
  }

  const downloadSampleXlsx = async () => {
    if (!metadataOnlyFile || !sampleGenerated || isGeneratingSample || isPreviewingMetadata) return
    setIsGeneratingSample(true)
    try {
      const { blob, filename } = await requestSampleData('xlsx')
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
      toastSuccess('Sample XLSX downloaded.')
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to download XLSX sample.')
    } finally {
      setIsGeneratingSample(false)
    }
  }

  const downloadMetadataTemplate = () => {
    const columns = [
      'Attribute Name',
      'Attribute Type',
      'Attribute Length',
      'Precision',
      'Scale',
      'Valid Values',
      'Sample Data',
      'Comments',
    ]
    const csv = `${columns.join(',')}\n`
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = 'metadata_template.csv'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }

  // Derive zone visual status for the data drop zone
  const dataZoneStatus = (): DropZoneStatus => {
    if (isPending) return 'uploading'
    if (fileWithDataMetaMode === 'data-file-excluding-metadata' && dataFile && !metaFile) return 'waiting'
    if (fileWithDataMetaMode === 'data-file-excluding-metadata' && dataFile && metaFile) return 'ready'
    return 'idle'
  }

  const toggleHelp = () => {
    if (showHelp) {
      setShowHelp(false)
      return
    }
    const rect = helpBtnRef.current?.getBoundingClientRect()
    if (!rect) {
      setShowHelp(true)
      return
    }
    const popupWidth = 288
    const popupHeightEstimate = 170
    // Keep bubble to the right of the icon so it doesn't cover the options stack.
    const left = Math.min(rect.right + 6, window.innerWidth - popupWidth - 12)
    const top = Math.max(12, Math.min(rect.top - 14, window.innerHeight - popupHeightEstimate - 12))
    // Pointer sits on left edge, aligned as close to icon center as possible.
    const iconCenterY = rect.top + rect.height / 2
    const pointerTop = Math.max(14, Math.min(popupHeightEstimate - 14, iconCenterY - top))
    setHelpPopupPos({
      left,
      top,
      pointerTop,
    })
    setShowHelp(true)
  }

  return (
    <div className="space-y-4">
      {/* Primary mode options */}
      <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Upload Mode</p>
          <div className="relative">
            <button
              ref={helpBtnRef}
              type="button"
              onClick={toggleHelp}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Upload mode help"
              title="Help"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <Toggle
            checked={fileWithDataMetaMode === 'file-including-metadata'}
            onChange={(v) => {
              if (!v) return
              setFileWithDataMetaMode('file-including-metadata')
              setDataFile(null)
              setMetaFile(null)
              setMetadataOnlyFile(null)
              setSampleGenerated(false)
              setFileMetadata(null)
            }}
          />
          <span className="text-xs font-medium text-foreground leading-tight">Data File with Metadata</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Toggle
            checked={fileWithDataMetaMode === 'data-file-excluding-metadata'}
            onChange={(v) => {
              if (!v) return
              setFileWithDataMetaMode('data-file-excluding-metadata')
              setDataFile(null)
              setMetaFile(null)
              setMetadataOnlyFile(null)
              setSampleGenerated(false)
              setFileMetadata(null)
            }}
          />
          <span className="text-xs font-medium text-foreground leading-tight">Data file without Metadata</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Toggle
            checked={fileWithDataMetaMode === 'only-metadata'}
            onChange={(v) => {
              if (!v) return
              setFileWithDataMetaMode('only-metadata')
              setDataFile(null)
              setMetaFile(null)
              setMetadataOnlyFile(null)
              setSampleGenerated(false)
              setFileMetadata(null)
            }}
          />
          <span className="text-xs font-medium text-foreground leading-tight">Only Metadata</span>
        </div>
      </div>

      {/* File including Metadata options */}
      {fileWithDataMetaMode === 'file-including-metadata' && (
        <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-3">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-medium text-foreground leading-tight">Metadata Position</span>
          <input
            type="number"
            min={1}
            value={headerPosition}
            onChange={(e) => setHeaderPosition(e.target.value)}
            placeholder="Row #"
              className="w-16 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          </div>
        </div>
      )}

      {/* Drop zone(s) */}
      {fileWithDataMetaMode === 'data-file-excluding-metadata' ? (
        <div className="grid grid-cols-1 gap-3">
          <DropZoneBox
            label="Data File"
            onFile={handleDataFile}
            status={dataZoneStatus()}
            uploadProgress={uploadProgress}
            selectedFile={dataFile}
            compact
          />
          <DropZoneBox
            label="Metadata File"
            onFile={handleMetaFile}
            status={metaFile ? 'ready' : 'idle'}
            selectedFile={metaFile}
            compact
          />
        </div>
      ) : fileWithDataMetaMode === 'only-metadata' ? (
        <div className="flex flex-col gap-3">
          <div className="space-y-2 rounded-lg border bg-muted/30 px-3 py-3">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-medium text-foreground leading-tight">Sample Row Count</span>
              <input
                type="number"
                min={1}
                max={appConfig.upload.metadataSampleMaxRows}
                value={sampleRowCount}
                onChange={(e) => setSampleRowCount(e.target.value)}
                className="w-20 rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Allowed range: 1 to {appConfig.upload.metadataSampleMaxRows}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="truncate text-xs font-semibold text-foreground">Metadata File</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={downloadMetadataTemplate}
                className="rounded border border-border bg-background px-2 py-1 text-[10px] font-semibold leading-none text-foreground hover:bg-muted"
              >
                Template
              </button>
              <button
                type="button"
                onClick={() => void generateSampleData()}
                disabled={!metadataOnlyFile || isGeneratingSample || isPreviewingMetadata}
                className="rounded border border-border bg-background px-2 py-1 text-[10px] font-semibold leading-none text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                Re-generate
              </button>
            </div>
          </div>
          <DropZoneBox
            label=""
            onFile={handleMetadataOnlyFile}
            status={isPreviewingMetadata ? 'uploading' : metadataOnlyFile ? 'ready' : 'idle'}
            uploadProgress={isPreviewingMetadata ? 100 : 0}
            selectedFile={metadataOnlyFile}
            compact
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void generateSampleData()}
              disabled={!metadataOnlyFile || isGeneratingSample || isPreviewingMetadata}
              className="flex-1 rounded-lg bg-primary px-2 py-2 text-xs font-medium leading-tight text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isGeneratingSample ? 'Generating...' : 'Generate Sample Data'}
            </button>
            <button
              type="button"
              disabled={!sampleDownloadUrl}
              onClick={() => {
                if (!sampleDownloadUrl) return
                const anchor = document.createElement('a')
                anchor.href = sampleDownloadUrl
                anchor.download = sampleDownloadName
                document.body.appendChild(anchor)
                anchor.click()
                document.body.removeChild(anchor)
              }}
              className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-xs font-medium leading-tight text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download Sample file(.csv)
            </button>
            <button
              type="button"
              onClick={() => void downloadSampleXlsx()}
              disabled={!sampleGenerated || isGeneratingSample || isPreviewingMetadata}
              className="flex-1 rounded-lg border border-border bg-background px-2 py-2 text-xs font-medium leading-tight text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              Download Sample file(.xlsx)
            </button>
          </div>
        </div>
      ) : (
        <DropZoneBox
          label=""
          onFile={handleDataFile}
          status={isPending ? 'uploading' : 'idle'}
          uploadProgress={uploadProgress}
        />
      )}

      {showHelp && helpPopupPos && (
        <div
          className="fixed z-40 w-72 origin-left rounded-lg border border-indigo-400/70 bg-background p-3 shadow-lg ring-1 ring-blue-400/30 transition-all duration-150 ease-out"
          style={{
            top: `${helpPopupPos.top}px`,
            left: `${helpPopupPos.left}px`,
            transform: showHelp ? 'scale(1) translateX(0)' : 'scale(0.96) translateX(-4px)',
            opacity: showHelp ? 1 : 0,
          }}
        >
          <span
            className="absolute -left-2 h-4 w-4 -translate-y-1/2 rotate-45 border-l-2 border-b-2 border-indigo-400/70 bg-background"
            style={{ top: `${helpPopupPos.pointerTop}px` }}
          />
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold text-foreground">Upload Mode Help</h3>
            <button
              type="button"
              onClick={() => setShowHelp(false)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Close help"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <ul className="list-disc space-y-2 pl-4 text-[11px] text-muted-foreground">
            <li>
              Choose <span className="font-semibold text-foreground">Data File with Metadata</span> when your file already contains header metadata in a row.
            </li>
            <li>
              Choose <span className="font-semibold text-foreground">Data file without Metadata</span> when metadata is provided in a separate file upload.
            </li>
            <li>
              Choose <span className="font-semibold text-foreground">Only Metadata</span> to generate a 100-row sample CSV from metadata headers only.
            </li>
          </ul>
        </div>
      )}

    </div>
  )
}
