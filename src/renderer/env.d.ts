import type { AppApi } from '@shared/types'

declare global {
  interface Window {
    appApi: AppApi
  }
}

export {}
