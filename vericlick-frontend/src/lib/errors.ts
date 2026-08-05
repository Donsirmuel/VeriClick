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
    const axiosError = error as {
      response?: { data?: ApiErrorResponse; status?: number }
      message?: string
      code?: string
    }
    const status = axiosError.response?.status
    const data = axiosError.response?.data
    const message = axiosError.message?.toLowerCase() ?? ''

    if (status === 429) {
      return 'Too many requests. Please slow down and try again.'
    }

    if (axiosError.code === 'ECONNABORTED' || message.includes('timeout') || message.includes('exceeded')) {
      return 'That request took too long. Please try again.'
    }

    if (axiosError.code === 'ERR_NETWORK' || message.includes('network') || message.includes('failed to fetch')) {
      return 'Could not reach the server. Check your internet connection and try again.'
    }

    if (data?.errors && data.errors.length > 0) {
      const detail = data.errors[0]?.detail
      return detail ? String(detail) : 'Something went wrong. Please try again.'
    }

    if (data?.error) {
      return String(data.error)
    }

    if (status && status >= 500) {
      return 'Server error. Please try again later.'
    }

    if (status) {
      return 'Something went wrong. Please try again.'
    }
  }

  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Could not reach the server. Check your internet connection and try again.'
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes('timeout') || message.includes('exceeded')) {
      return 'That request took too long. Please try again.'
    }
    if (message.includes('network') || message.includes('failed to fetch')) {
      return 'Could not reach the server. Check your internet connection and try again.'
    }
  }

  return 'An unexpected error occurred. Please try again.'
}

export function showErrorToast(error: unknown, fallback: string) {
  const message = parseApiError(error)
  toast.error(message || fallback)
}
