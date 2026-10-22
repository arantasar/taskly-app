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
