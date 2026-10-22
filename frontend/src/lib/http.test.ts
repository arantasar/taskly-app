import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => vi.unstubAllGlobals())

it('prefixes the path with /api and merges JSON headers with custom ones', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }))
  await expect(
    request('/todos', { method: 'POST', headers: { 'X-Trace': '1' } }),
  ).resolves.toEqual({ ok: true })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trace': '1' },
  })
})

it('sends the JSON content type when called without options', async () => {
  fetchMock.mockResolvedValue(jsonResponse(200, []))
  await expect(request('/todos')).resolves.toEqual([])
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    headers: { 'Content-Type': 'application/json' },
  })
})

it('resolves to undefined for 204 responses', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(
    request('/todos/7', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

describe('network failures', () => {
  it('reports a connection problem when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(request('/todos')).rejects.toThrow(
      'Cannot connect to the server. Please try again.',
    )
  })

  it('rethrows the original error when the request was aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const abortError = new DOMException('Aborted', 'AbortError')
    fetchMock.mockRejectedValue(abortError)
    await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
      abortError,
    )
  })
})

describe('error responses', () => {
  it('maps 422 to the field-limits message regardless of the body', async () => {
    fetchMock.mockResolvedValue(jsonResponse(422, { detail: [{ msg: 'x' }] }))
    await expect(request('/todos')).rejects.toThrow(
      'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
    )
  })

  it('surfaces a string detail from the server', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { detail: 'Task not found.' }),
    )
    await expect(request('/todos/1')).rejects.toThrow('Task not found.')
  })

  it.each([
    ['a non-string detail', jsonResponse(500, { detail: { code: 1 } })],
    ['a body that is not JSON', new Response('oops', { status: 502 })],
  ])('falls back to a generic message for %s', async (_, response) => {
    fetchMock.mockResolvedValue(response)
    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  })
})
