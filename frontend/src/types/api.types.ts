/** API request/response DTOs matching backend Pydantic schemas. */

export interface UploadResponse {
  session_id: string
  filename: string
  row_count: number
  column_count: number
  columns: string[]
  dtypes: Record<string, string>
  file_size_bytes: number
}

export interface MetadataPreviewResponse {
  filename: string
  column_count: number
  columns: string[]
  dtypes: Record<string, string>
  file_size_bytes: number
}

export interface FileMetadata {
  filename: string
  rowCount: number
  columnCount: number
  columns: string[]
  dtypes: Record<string, string>
  fileSizeBytes: number
}

export interface ExecutionJobResponse {
  job_id: string
  status: string
}

export interface ExecutionResult {
  job_id: string
  status: 'queued' | 'running' | 'success' | 'error'
  preview_rows: Record<string, unknown>[]
  preview_columns: string[]
  error_message: string | null
  execution_time_ms: number | null
}

export interface ApiError {
  error_code: string
  message: string
  fields?: unknown[]
}

export interface SaveCodeLibraryRequest {
  code: string
  label: string
  visibility: 'public' | 'private'
}

export interface SaveCodeLibraryResponse {
  saved_in: Array<'public' | 'private'>
  filenames: string[]
}

export interface CodeLibraryItem {
  filename: string
  updated_at: string
}

export interface CodeLibraryListResponse {
  visibility: 'public' | 'private'
  items: CodeLibraryItem[]
}
