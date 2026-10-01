import { useCallback, useEffect, useRef, useState } from 'react'

const neverUnavailable = () => false
const emptyState = (key) => ({ key, data: null, error: null, updatedAt: null, refreshing: false, paused: null })

// Keep the loader and isUnavailable callbacks stable with useCallback (or define
// them outside the component). Change resourceKey when filters or IDs change.
export default function useLiveRefresh(loader, {
  resourceKey,
  intervalMs = 30000,
  enabled = true,
  isUnavailable = neverUnavailable,
} = {}) {
  const [state, setState] = useState(() => emptyState(resourceKey))
  const runRef = useRef(null)
  const refresh = useCallback(() => runRef.current?.(), [])

  useEffect(() => {
    let active = true
    let pending = null
    let timer = null
    const pauseReason = () => !enabled ? 'disabled'
      : navigator.onLine === false ? 'offline'
        : document.visibilityState === 'hidden' ? 'hidden' : null
    setState({ ...emptyState(resourceKey), paused: pauseReason() })

    const stopPending = () => {
      pending?.controller.abort()
      pending = null
    }
    const run = () => {
      if (!active || pauseReason()) return Promise.resolve()
      if (pending) return pending.promise
      const request = { controller: new AbortController(), promise: null, invalidated: false }
      pending = request
      setState((previous) => ({ ...previous, refreshing: true, error: null }))
      request.promise = (async () => {
        try {
          const data = await loader({ signal: request.controller.signal })
          if (active && pending === request && !request.controller.signal.aborted && !request.invalidated) {
            setState((previous) => ({ ...previous, data, error: null, updatedAt: new Date(), refreshing: false }))
          }
        } catch (error) {
          if (active && pending === request && !request.controller.signal.aborted && !request.invalidated && error?.code !== 'ABORTED') {
            setState((previous) => ({ ...previous, error, refreshing: false,
              ...(isUnavailable(error) ? { data: null, updatedAt: null } : {}) }))
          }
        } finally {
          if (pending === request) {
            pending = null
            if (active) setState((previous) => ({ ...previous, refreshing: false }))
            if (active && request.invalidated) run()
          }
        }
      })()
      return request.promise
    }

    const contentChanged = () => {
      // A read already in flight may contain the snapshot from before this write.
      // Coalesce writes into one fresh read rather than dropping the invalidation.
      if (pending) pending.invalidated = true
      else run()
    }

    const syncActivity = () => {
      clearInterval(timer)
      timer = null
      const paused = pauseReason()
      setState((previous) => ({ ...previous, paused }))
      if (paused) {
        stopPending()
        setState((previous) => ({ ...previous, refreshing: false }))
        return
      }
      run()
      if (intervalMs > 0) timer = setInterval(run, intervalMs)
    }

    runRef.current = run
    document.addEventListener('visibilitychange', syncActivity)
    window.addEventListener('online', syncActivity)
    window.addEventListener('offline', syncActivity)
    window.addEventListener('focus', run)
    window.addEventListener('causeconnect:content', contentChanged)
    syncActivity()
    return () => {
      active = false
      clearInterval(timer)
      stopPending()
      document.removeEventListener('visibilitychange', syncActivity)
      window.removeEventListener('online', syncActivity)
      window.removeEventListener('offline', syncActivity)
      window.removeEventListener('focus', run)
      window.removeEventListener('causeconnect:content', contentChanged)
      if (runRef.current === run) runRef.current = null
    }
  }, [loader, resourceKey, intervalMs, enabled, isUnavailable])

  // A changed query must never render the previous query's data for one frame.
  const current = state.key === resourceKey ? state : emptyState(resourceKey)
  return { ...current, isLoading: current.data === null && current.error === null, refresh }
}
