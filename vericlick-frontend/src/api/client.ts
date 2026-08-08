import axios from 'axios'

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toSnakeCase(key: string): string {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

function toCamelCase(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function transformKeys(obj: unknown, transform: (key: string) => string): unknown {
  if (Array.isArray(obj)) {
    return obj.map((item) => transformKeys(item, transform))
  }
  if (isObject(obj)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(obj)) {
      result[transform(key)] = transformKeys(value, transform)
    }
    return result
  }
  return obj
}

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  if (config.data && config.method !== 'get' && !(config.data instanceof FormData)) {
    config.data = transformKeys(config.data, toSnakeCase)
  }
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    if (response.data && typeof response.data === 'object') {
      response.data = transformKeys(response.data, toCamelCase) as typeof response.data
    }
    return response
  },
  async (error) => {
    if (!error.response) {
      return Promise.reject(error)
    }

    const { status, config } = error.response

    if (status === 429) {
      return Promise.reject(error)
    }

    // A failed sign-in (or refresh) must never trigger the token-refresh
    // dance below: retrying "wrong password" against a stale token re-fires the
    // request, silently discards the user's session, and buries the real reason
    // for the failure. Auth endpoints report their own errors directly.
    const isAuthRequest = /\/auth\/(login|refresh|google)\//.test(config.url ?? '')

    if (status === 401 && !config._retry && !isAuthRequest) {
      const refresh = localStorage.getItem('refresh')

      if (refresh && !isRefreshing) {
        config._retry = true
        isRefreshing = true

        try {
          const { data } = await axios.post(
            `${apiClient.defaults.baseURL}/auth/refresh/`,
            { refresh },
          )
          localStorage.setItem('token', data.access)
          isRefreshing = false
          pendingRequests.forEach(cb => cb(data.access))
          pendingRequests = []
          config.headers.Authorization = `Bearer ${data.access}`
          return apiClient(config)
        } catch {
          isRefreshing = false
          pendingRequests = []
        }
      } else if (refresh && isRefreshing) {
        return new Promise((resolve) => {
          pendingRequests.push((token: string) => {
            config.headers.Authorization = `Bearer ${token}`
            resolve(apiClient(config))
          })
        })
      }

      localStorage.removeItem('token')
      localStorage.removeItem('refresh')
      window.location.href = '/auth/login'
    }

    return Promise.reject(error)
  },
)

let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []
