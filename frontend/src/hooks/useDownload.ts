import { useState } from 'react'
import appConfig from '@/config/app.config'
import { useExecutionStore } from '@/store/executionStore'
import { toastError } from '@/utils/toast'

export function useDownload() {
  const [isDownloading, setIsDownloading] = useState(false)
  const { jobId, sessionId } = useExecutionStore()

  const downloadCsv = async () => {
    if (!jobId || !sessionId) return
    setIsDownloading(true)

    try {
      const url = `${appConfig.api.baseUrl}${appConfig.api.prefix}/execute/${sessionId}/${jobId}/download`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Download failed: HTTP ${response.status}`)
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const disposition = response.headers.get('content-disposition') ?? ''
      const filenameMatch = disposition.match(/filename\*?=(?:UTF-8''|")?([^\";]+)/i)
      const filename = filenameMatch?.[1]?.trim() || 'output.csv'
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      // Delay revocation so the browser has time to fully consume the blob.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Download failed.')
    } finally {
      setIsDownloading(false)
    }
  }

  return { downloadCsv, isDownloading }
}
