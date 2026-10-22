import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { remove: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

it('deletes the task and removes it from the cached list', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  const other = { ...todoFixture, id: 3 }
  client.setQueryData<Todo[]>(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(7))

  expect(todosApi.remove).toHaveBeenCalledWith(7)
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('invalidates the stats after a successful deletion only', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  vi.mocked(todosApi.remove).mockResolvedValueOnce(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(7))
  expect(invalidate).toHaveBeenCalledWith({ queryKey: todoKeys.stats })

  invalidate.mockClear()
  vi.mocked(todosApi.remove).mockRejectedValueOnce(new Error('Not found'))
  await act(() => result.current.mutateAsync(7).catch(() => undefined))
  expect(invalidate).not.toHaveBeenCalled()
})

it('does not create a list when nothing is cached', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(7))

  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the task cached when deletion fails', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.remove).mockRejectedValue(new Error('Task not found.'))
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })

  act(() => result.current.mutate(7))

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
