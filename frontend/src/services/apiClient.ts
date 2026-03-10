import axios, { type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import appConfig from '@/config/app.config'

const apiClient = axios.create({
  baseURL: appConfig.api.baseUrl + appConfig.api.prefix,
  timeout: appConfig.api.timeoutMs,
  headers: { 'Content-Type': 'application/json' },
})

// Request interceptor: attach unique request ID
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  config.headers['X-Request-ID'] = crypto.randomUUID()
  return config
})

// Response interceptor: normalize error shapes
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data as Record<string, unknown> | undefined
      const message =
        (data?.message as string | undefined) ??
        error.message ??
        'An unexpected error occurred.'
      return Promise.reject(new Error(message))
    }
    return Promise.reject(error)
  },
)

export async function apiGet<T>(path: string): Promise<T> {
  const res = await apiClient.get<T>(path)
  return res.data
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await apiClient.post<T>(path, body)
  return res.data
}

export async function apiDelete<T = void>(path: string): Promise<T> {
  const res = await apiClient.delete<T>(path)
  return res.data
}

export async function apiPostFormData<T>(
  path: string,
  formData: FormData,
  onUploadProgress?: (progress: number) => void,
): Promise<T> {
  const res = await apiClient.post<T>(path, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: onUploadProgress
      ? (evt) => {
          const pct = evt.total ? Math.round((evt.loaded * 100) / evt.total) : 0
          onUploadProgress(pct)
        }
      : undefined,
  })
  return res.data
}

export default apiClient
