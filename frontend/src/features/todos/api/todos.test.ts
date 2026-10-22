import { beforeEach, expect, it, vi } from 'vitest'
import { request } from '../../../lib/http'
import { todoFixture } from '../../../test/todoFixture'
import { todosApi } from './todos'

vi.mock('../../../lib/http', () => ({ request: vi.fn() }))
beforeEach(() => vi.clearAllMocks())

it('passes the abort signal when fetching tasks', async () => {
  const signal = new AbortController().signal
  vi.mocked(request).mockResolvedValue([todoFixture])
  await expect(todosApi.list(signal)).resolves.toEqual([todoFixture])
  expect(request).toHaveBeenCalledWith('/todos', { signal })
})

it('requests stats for the given local date with the abort signal', async () => {
  const signal = new AbortController().signal
  const stats = { total: 4, active: 3, completed: 1, overdue: 2 }
  vi.mocked(request).mockResolvedValue(stats)
  await expect(todosApi.stats('2026-10-22', signal)).resolves.toEqual(stats)
  expect(request).toHaveBeenCalledWith('/todos/stats?today=2026-10-22', {
    signal,
  })
})

it('encodes the date in the stats query string', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await todosApi.stats('2026-10-22&x=1')
  expect(request).toHaveBeenCalledWith(
    '/todos/stats?today=2026-10-22%26x%3D1',
    { signal: undefined },
  )
})

it('sends only writable task fields on creation', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await expect(todosApi.create(todoFixture)).resolves.toEqual(todoFixture)
  expect(request).toHaveBeenCalledWith('/todos', {
    method: 'POST',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    }),
  })
})

it('patches only the provided writable fields of a task', async () => {
  const updated = { ...todoFixture, completed: true }
  vi.mocked(request).mockResolvedValue(updated)
  await expect(
    todosApi.update(7, { ...updated, due_date: null }),
  ).resolves.toEqual(updated)
  expect(request).toHaveBeenCalledWith('/todos/7', {
    method: 'PATCH',
    body: JSON.stringify({
      title: todoFixture.title,
      description: '',
      priority: 'medium',
      due_date: null,
      completed: true,
    }),
  })
})

it('omits fields that are not part of a partial update', async () => {
  vi.mocked(request).mockResolvedValue(todoFixture)
  await todosApi.update(3, { completed: true })
  expect(request).toHaveBeenCalledWith('/todos/3', {
    method: 'PATCH',
    body: '{"completed":true}',
  })
})

it('deletes a task by id', async () => {
  vi.mocked(request).mockResolvedValue(undefined)
  await expect(todosApi.remove(7)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledWith('/todos/7', { method: 'DELETE' })
})
