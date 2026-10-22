import { act, renderHook, waitFor } from '@testing-library/react'
import { useMutation } from '@tanstack/react-query'
import { expect, it } from 'vitest'
import { createQueryClientWrapper } from '../../../test/queryClientWrapper'
import { todoKeys } from '../api/queryKeys'
import { useTodosBusy } from './useTodosBusy'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

function renderBusyWithMutation(mutationKey: readonly string[]) {
  const { wrapper } = createQueryClientWrapper()
  const pending = deferred()
  const { result } = renderHook(
    () => ({
      busy: useTodosBusy(),
      mutation: useMutation({ mutationKey, mutationFn: () => pending.promise }),
    }),
    { wrapper },
  )
  return { result, pending }
}

it.each([[todoKeys.create], [todoKeys.update], [todoKeys.delete]])(
  'is busy while a %j task mutation is pending',
  async (mutationKey: readonly string[]) => {
    const { result, pending } = renderBusyWithMutation(mutationKey)
    expect(result.current.busy).toBe(false)

    act(() => result.current.mutation.mutate())
    await waitFor(() => expect(result.current.busy).toBe(true))

    await act(async () => pending.resolve())
    await waitFor(() => expect(result.current.busy).toBe(false))
  },
)

it('ignores mutations outside the todos key', async () => {
  const { result, pending } = renderBusyWithMutation(['profile', 'update'])

  act(() => result.current.mutation.mutate())
  await waitFor(() => expect(result.current.mutation.isPending).toBe(true))

  expect(result.current.busy).toBe(false)
  await act(async () => pending.resolve())
})
