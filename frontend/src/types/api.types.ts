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
  overwrite?: boolean
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

export interface ShareToPublicResponse {
  filename: string
  message: string
}

export interface ShareToUsersRequest {
  user_ids: string[]
}

export interface ShareToUsersResponse {
  filename: string
  shared_to: string[]
}

export interface SaveInstructionLibraryRequest {
  instruction: string
  label: string
  overwrite?: boolean
}

export interface SaveInstructionLibraryResponse {
  filename: string
}

export interface InstructionLibraryItem {
  filename: string
  updated_at: string
}

export interface InstructionLibraryListResponse {
  items: InstructionLibraryItem[]
}

export interface CodeLibraryContentResponse {
  filename: string
  visibility: 'public' | 'private'
  code: string
}

export interface CodeCacheEntry {
  label: string
  code: string
  raw_instructions: string
  refined_prompt: string
  saved_at: string
}

export interface SaveCodeCacheRequest {
  label: string
  code: string
  raw_instructions: string
  refined_prompt: string
}

export interface ColumnSummary {
  column: string
  dtype: string
  record_count: number
  null_count: number
  count_with_values: number
  unique_count: number
  is_key_column: 'Yes' | 'No'
  min_value: string | null
  max_value: string | null
}

export interface FileSummaryResponse {
  session_id: string
  filename: string
  columns: ColumnSummary[]
}

export interface ColumnValuesResponse {
  column: string
  values: string[]
  is_sample: boolean
}
