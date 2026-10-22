import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('starts without a notice and exposes a notification callback', () => {
  const { result } = renderHook(() => useNotice())
  expect(result.current.message).toBe('')
  expect(result.current.notify).toEqual(expect.any(Function))
})

it('shows a notice and hides it after 4 seconds', () => {
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('Task added.'))
  expect(result.current.message).toBe('Task added.')
  act(() => vi.advanceTimersByTime(3999))
  expect(result.current.message).toBe('Task added.')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.message).toBe('')
})

it('restarts the 4 second window when a new notice replaces the old one', () => {
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('First'))
  act(() => vi.advanceTimersByTime(3000))
  act(() => result.current.notify('Second'))
  act(() => vi.advanceTimersByTime(3000))
  expect(result.current.message).toBe('Second')
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current.message).toBe('')
})

it('keeps the notify callback stable across renders', () => {
  const { result, rerender } = renderHook(() => useNotice())
  const { notify } = result.current
  act(() => notify('Saved'))
  rerender()
  expect(result.current.notify).toBe(notify)
})

it('clears the pending timeout on unmount', () => {
  const { result, unmount } = renderHook(() => useNotice())
  act(() => result.current.notify('Saved'))
  expect(vi.getTimerCount()).toBe(1)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
