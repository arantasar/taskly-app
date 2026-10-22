import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useTodoStatsQuery } from './useTodoStatsQuery'

vi.mock('../api/todos', () => ({
  todosApi: { stats: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.useRealTimers())

const stats = { total: 4, active: 3, completed: 1, overdue: 2 }

it('loads stats for the local date into the stats cache', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 15, 23, 30))
  const { client, wrapper } = createQueryClientWrapper()
  vi.mocked(todosApi.stats).mockResolvedValue(stats)
  const { result } = renderHook(() => useTodoStatsQuery(), { wrapper })

  await waitFor(() => expect(result.current.isSuccess).toBe(true))

  expect(result.current.data).toEqual(stats)
  expect(client.getQueryData(todoKeys.stats)).toEqual(stats)
  expect(todosApi.stats).toHaveBeenCalledWith(
    '2026-10-15',
    expect.any(AbortSignal),
  )
})

it('exposes a loading error', async () => {
  const { wrapper } = createQueryClientWrapper()
  vi.mocked(todosApi.stats).mockRejectedValue(new Error('Cannot connect'))
  const { result } = renderHook(() => useTodoStatsQuery(), { wrapper })

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toEqual(new Error('Cannot connect'))
})
