import toast from 'react-hot-toast'

interface ApiErrorDetail {
  field?: string
  detail: string
}

interface ApiErrorResponse {
  errors?: ApiErrorDetail[]
  error?: string
}

export function parseApiError(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: ApiErrorResponse; status?: number } }
    const status = axiosError.response?.status
    const data = axiosError.response?.data

    if (status === 429) {
      return 'Too many requests. Please slow down and try again.'
    }

    if (data?.errors && data.errors.length > 0) {
      return data.errors.map(e => e.detail).join(', ')
    }

    if (data?.error) {
      return data.error
    }

    if (status && status >= 500) {
      return 'Server error. Please try again later.'
    }
  }

  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Network error. Check your connection.'
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unexpected error occurred'
}

export function showErrorToast(error: unknown, fallback: string) {
  const message = parseApiError(error)
  toast.error(message || fallback)
}
