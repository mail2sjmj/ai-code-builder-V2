/** Central application configuration — all values from env vars with safe defaults. */
const appConfig = {
  api: {
    baseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000',
    prefix: '/api/v1',
    timeoutMs: 30_000,
  },
  upload: {
    maxFileSizeMb: Number(import.meta.env.VITE_MAX_UPLOAD_SIZE_MB ?? 50),
    metadataSampleDefaultRows: Number(import.meta.env.VITE_METADATA_SAMPLE_DEFAULT_ROWS ?? 100),
    metadataSampleMaxRows: Number(import.meta.env.VITE_METADATA_SAMPLE_MAX_ROWS ?? 5000),
    allowedExtensions: ['.csv', '.xlsx'] as string[],
    allowedMimeTypes: [
      'text/csv',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ] as string[],
  },
  editor: {
    theme: 'vs-dark' as const,
    language: 'python' as const,
    fontSize: 14,
    minimap: { enabled: false },
  },
  preview: {
    rowCount: Number(import.meta.env.VITE_PREVIEW_ROW_COUNT ?? 50),
  },
  execution: {
    pollIntervalMs: 1500,
    maxPollAttempts: 40, // 40 × 1.5s = 60s max
  },
} as const

export default appConfig
export type AppConfig = typeof appConfig
