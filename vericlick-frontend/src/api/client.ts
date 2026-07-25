import axios from 'axios'

// Set to true to use mock data instead of real API calls
export const MOCK_MODE = import.meta.env.VITE_MOCK_MODE === 'true' || true

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add interceptor for auth tokens later
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})
