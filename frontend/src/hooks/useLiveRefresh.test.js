import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import useLiveRefresh from './useLiveRefresh.js'

let visibility
let connection
const settle = () => act(async () => { await Promise.resolve() })
const tick = (milliseconds = 30000) => act(async () => { await vi.advanceTimersByTimeAsync(milliseconds) })
function deferred() {
  let resolve
  let reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-09-30T12:00:00Z'))
  visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  connection = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('useLiveRefresh', () => {
  it('loads immediately and refreshes every 30 seconds with a successful-update timestamp', async () => {
    const loader = vi.fn().mockResolvedValue({ title: 'Current campaign' })
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'campaign:1' }))
    expect(result.current.isLoading).toBe(true)
    await settle()
    expect(result.current.data).toEqual({ title: 'Current campaign' })
    expect(result.current.updatedAt.toISOString()).toBe('2026-09-30T12:00:00.000Z')
    await tick(29999)
    expect(loader).toHaveBeenCalledTimes(1)
    await tick(1)
    expect(loader).toHaveBeenCalledTimes(2)
    expect(result.current.updatedAt.toISOString()).toBe('2026-09-30T12:00:30.000Z')
  })

  it('retains successful content while a background request is pending', async () => {
    const next = deferred()
    const loader = vi.fn().mockResolvedValueOnce('first').mockReturnValueOnce(next.promise)
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    await settle()
    await tick()
    expect(result.current.data).toBe('first')
    expect(result.current.isLoading).toBe(false)
    expect(result.current.refreshing).toBe(true)
    await act(async () => { next.resolve('second') })
    expect(result.current.data).toBe('second')
    expect(result.current.refreshing).toBe(false)
  })

  it('retains the last timestamp and data on failure and supports manual recovery', async () => {
    const failure = new Error('Network unavailable')
    const loader = vi.fn().mockResolvedValueOnce('first').mockRejectedValueOnce(failure).mockResolvedValueOnce('recovered')
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    await settle()
    const previousDate = result.current.updatedAt
    await tick()
    expect(result.current.data).toBe('first')
    expect(result.current.error).toBe(failure)
    expect(result.current.updatedAt).toBe(previousDate)
    await act(async () => { await result.current.refresh() })
    expect(result.current.data).toBe('recovered')
    expect(result.current.error).toBeNull()
  })

  it('deduplicates overlapping manual, focus, reconnect and timer requests', async () => {
    const waiting = deferred()
    const loader = vi.fn().mockReturnValue(waiting.promise)
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    act(() => {
      result.current.refresh()
      window.dispatchEvent(new Event('focus'))
      window.dispatchEvent(new Event('online'))
      window.dispatchEvent(new CustomEvent('causeconnect:content'))
    })
    await tick(90000)
    expect(loader).toHaveBeenCalledTimes(1)
    await act(async () => { waiting.resolve('finished') })
    expect(result.current.data).toBe('finished')
  })

  it('aborts a hidden-page request, stops polling and revalidates when visible', async () => {
    const waiting = deferred()
    const loader = vi.fn().mockReturnValueOnce(waiting.promise).mockResolvedValue('visible result')
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    const signal = loader.mock.calls[0][0].signal
    visibility.mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(signal.aborted).toBe(true)
    expect(result.current.paused).toBe('hidden')
    await tick(90000)
    act(() => window.dispatchEvent(new Event('focus')))
    expect(loader).toHaveBeenCalledTimes(1)
    visibility.mockReturnValue('visible')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(loader).toHaveBeenCalledTimes(2)
    await act(async () => { waiting.resolve('stale hidden result') })
    expect(result.current.data).toBe('visible result')
    expect(result.current.paused).toBeNull()
  })

  it('stops in-flight and future requests offline, then refreshes on reconnect', async () => {
    const waiting = deferred()
    const loader = vi.fn().mockResolvedValueOnce('cached').mockReturnValueOnce(waiting.promise).mockResolvedValue('reconnected')
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    await settle()
    await tick()
    connection.mockReturnValue(false)
    act(() => window.dispatchEvent(new Event('offline')))
    expect(loader.mock.calls[1][0].signal.aborted).toBe(true)
    expect(result.current.data).toBe('cached')
    expect(result.current.paused).toBe('offline')
    await tick(60000)
    await act(async () => { await result.current.refresh() })
    expect(loader).toHaveBeenCalledTimes(2)
    connection.mockReturnValue(true)
    await act(async () => window.dispatchEvent(new Event('online')))
    expect(result.current.data).toBe('reconnected')
    expect(loader).toHaveBeenCalledTimes(3)
  })

  it.each(['hidden', 'offline'])('does not start requests while initially %s', async (reason) => {
    if (reason === 'hidden') visibility.mockReturnValue('hidden')
    else connection.mockReturnValue(false)
    const loader = vi.fn()
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    await tick(60000)
    expect(loader).not.toHaveBeenCalled()
    expect(result.current.paused).toBe(reason)
  })

  it('revalidates on focus without removing existing data', async () => {
    const loader = vi.fn().mockResolvedValueOnce('before').mockResolvedValue('after')
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    await settle()
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(result.current.data).toBe('after')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('refreshes after a content-change event and still respects hidden-page pausing', async () => {
    const loader = vi.fn().mockResolvedValueOnce('before edit').mockResolvedValue('after edit')
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    await settle()
    await act(async () => window.dispatchEvent(new CustomEvent('causeconnect:content')))
    expect(result.current.data).toBe('after edit')
    visibility.mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
      window.dispatchEvent(new CustomEvent('causeconnect:content'))
    })
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('aborts old queries and ignores late results even when the loader ignores abort', async () => {
    const old = deferred()
    const loader = vi.fn().mockReturnValueOnce(old.promise).mockResolvedValue('new query')
    const { result, rerender } = renderHook(({ resourceKey }) => useLiveRefresh(loader, { resourceKey }), { initialProps: { resourceKey: 'old' } })
    const oldSignal = loader.mock.calls[0][0].signal
    rerender({ resourceKey: 'new' })
    expect(oldSignal.aborted).toBe(true)
    await settle()
    await act(async () => { old.resolve('old query') })
    expect(result.current.data).toBe('new query')
    expect(result.current.key).toBe('new')
  })

  it('discards previously successful private or removed content on an unavailable response', async () => {
    const failure = { code: 'NOT_FOUND' }
    const loader = vi.fn().mockResolvedValueOnce('public campaign').mockRejectedValueOnce(failure)
    const unavailable = (error) => error.code === 'NOT_FOUND'
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'campaign', isUnavailable: unavailable }))
    await settle()
    await tick()
    expect(result.current.data).toBeNull()
    expect(result.current.updatedAt).toBeNull()
    expect(result.current.error).toBe(failure)
  })

  it('does not fetch when disabled and starts once enabled', async () => {
    const loader = vi.fn().mockResolvedValue('enabled')
    const { result, rerender } = renderHook(({ enabled }) => useLiveRefresh(loader, { resourceKey: 'list', enabled }), { initialProps: { enabled: false } })
    await tick()
    expect(loader).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await settle()
    expect(result.current.data).toBe('enabled')
  })

  it('aborts and removes timers and event listeners when unmounted', async () => {
    const waiting = deferred()
    const loader = vi.fn().mockReturnValue(waiting.promise)
    const { unmount } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    const signal = loader.mock.calls[0][0].signal
    unmount()
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    act(() => { window.dispatchEvent(new Event('focus')); window.dispatchEvent(new Event('online')); window.dispatchEvent(new CustomEvent('causeconnect:content')) })
    await tick()
    expect(loader).toHaveBeenCalledTimes(1)
    await act(async () => { waiting.resolve('too late') })
  })

  it('handles a synchronous loader failure without creating overlapping requests', async () => {
    const loader = vi.fn().mockImplementation(() => { throw new Error('Invalid query') })
    const { result } = renderHook(() => useLiveRefresh(loader, { resourceKey: 'list' }))
    await settle()
    expect(result.current.error.message).toBe('Invalid query')
    await tick()
    expect(loader).toHaveBeenCalledTimes(2)
  })
})
