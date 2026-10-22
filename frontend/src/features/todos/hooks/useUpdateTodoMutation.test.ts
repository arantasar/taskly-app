import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { update: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

it('updates the task and replaces only it in the cached list', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  const other = { ...todoFixture, id: 3 }
  const saved = { ...todoFixture, completed: true }
  client.setQueryData<Todo[]>(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })

  await act(() =>
    result.current.mutateAsync({ id: 7, input: { completed: true } }),
  )

  expect(todosApi.update).toHaveBeenCalledWith(7, { completed: true })
  expect(client.getQueryData(todoKeys.list)).toEqual([other, saved])
})

it('invalidates the stats after a successful update only', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  vi.mocked(todosApi.update).mockResolvedValueOnce(todoFixture)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })

  await act(() =>
    result.current.mutateAsync({ id: 7, input: { completed: true } }),
  )
  expect(invalidate).toHaveBeenCalledWith({ queryKey: todoKeys.stats })

  invalidate.mockClear()
  vi.mocked(todosApi.update).mockRejectedValueOnce(new Error('Not found'))
  await act(() =>
    result.current
      .mutateAsync({ id: 7, input: { completed: true } })
      .catch(() => undefined),
  )
  expect(invalidate).not.toHaveBeenCalled()
})

it('does not create a list when nothing is cached', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync({ id: 7, input: { title: 'x' } }))

  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('leaves the cache untouched when the update fails', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.update).mockRejectedValue(new Error('Task not found.'))
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })

  act(() => result.current.mutate({ id: 7, input: { completed: true } }))

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
