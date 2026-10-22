import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { create: vi.fn() },
}))
beforeEach(() => vi.clearAllMocks())

const input = {
  title: 'New task',
  description: '',
  priority: 'low' as const,
  due_date: null,
  completed: false,
}

it('creates the task and prepends it to the cached list', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  const saved: Todo = { ...todoFixture, id: 8, ...input }
  client.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(input))

  expect(todosApi.create).toHaveBeenCalledWith(input)
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, todoFixture])
})

it('starts the list when nothing is cached yet', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(input))

  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('replaces an already cached copy instead of duplicating it', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  const other = { ...todoFixture, id: 3 }
  const saved = { ...todoFixture, title: 'Server version' }
  client.setQueryData<Todo[]>(todoKeys.list, [other, todoFixture])
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  await act(() => result.current.mutateAsync(input))

  expect(client.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('leaves the cache untouched and exposes the error when creation fails', async () => {
  const { client, wrapper } = createQueryClientWrapper()
  client.setQueryData<Todo[]>(todoKeys.list, [todoFixture])
  vi.mocked(todosApi.create).mockRejectedValue(new Error('Server down'))
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })

  act(() => result.current.mutate(input))

  await waitFor(() => expect(result.current.isError).toBe(true))
  expect(result.current.error).toEqual(new Error('Server down'))
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})
