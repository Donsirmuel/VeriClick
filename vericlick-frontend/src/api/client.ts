import axios from 'axios'

export const MOCK_MODE = import.meta.env.VITE_MOCK_MODE !== 'false'

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
  return config
})

let isRefreshing = false
let pendingRequests: Array<(token: string) => void> = []

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      return Promise.reject(error)
    }

    const { status, config } = error.response

    if (status === 429) {
      return Promise.reject(error)
    }

    if (status === 401 && !config._retry) {
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
