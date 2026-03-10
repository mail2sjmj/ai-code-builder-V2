import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { apiPostFormData } from '@/services/apiClient'
import { useSessionStore } from '@/store/sessionStore'
import { toastError, toastSuccess } from '@/utils/toast'
import type { FileMetadata, UploadResponse } from '@/types/api.types'

export function useFileUpload() {
  const [uploadProgress, setUploadProgress] = useState(0)
  const { setSession } = useSessionStore()

  const mutation = useMutation({
    mutationFn: ({ file, headerRow, metaFile }: { file: File; headerRow?: number; metaFile?: File }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (headerRow != null) formData.append('header_row', String(headerRow))
      if (metaFile != null) formData.append('meta_file', metaFile)
      return apiPostFormData<UploadResponse>('/upload', formData, setUploadProgress)
    },
    onSuccess: (data) => {
      const metadata: FileMetadata = {
        filename: data.filename,
        rowCount: data.row_count,
        columnCount: data.column_count,
        columns: data.columns,
        dtypes: data.dtypes,
        fileSizeBytes: data.file_size_bytes,
      }
      setSession(data.session_id, metadata)
      toastSuccess(`Uploaded "${data.filename}" — ${data.row_count.toLocaleString()} rows`)
      setUploadProgress(0)
    },
    onError: (error: Error) => {
      toastError(error.message)
      setUploadProgress(0)
    },
  })

  return {
    uploadFile: mutation.mutate,
    uploadFileAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
    uploadProgress,
  }
}
