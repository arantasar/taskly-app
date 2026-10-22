import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { Todo, TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    initial,
    busy,
    error,
    onSubmit,
    onCancel,
  }: {
    initial?: Todo
    busy: boolean
    error: string | null
    onSubmit: (input: TodoInput) => Promise<void>
    onCancel: () => void
  }) => (
    <>
      <p>{initial ? `Form for ${initial.title}` : 'Empty form'}</p>
      {busy && <p>Form busy</p>}
      {error && <p>Form error: {error}</p>}
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
      <button onClick={onCancel}>Cancel form</button>
    </>
  ),
}))

function mockMutations({
  create = {},
  update = {},
}: {
  create?: Record<string, unknown>
  update?: Record<string, unknown>
} = {}) {
  const createMutation = {
    isPending: false,
    error: null,
    mutateAsync: vi.fn().mockResolvedValue(todoFixture),
    ...create,
  }
  const updateMutation = {
    isPending: false,
    error: null,
    mutateAsync: vi.fn().mockResolvedValue(todoFixture),
    ...update,
  }
  vi.mocked(useCreateTodoMutation).mockReturnValue(
    createMutation as unknown as ReturnType<typeof useCreateTodoMutation>,
  )
  vi.mocked(useUpdateTodoMutation).mockReturnValue(
    updateMutation as unknown as ReturnType<typeof useUpdateTodoMutation>,
  )
  return {
    create: createMutation.mutateAsync,
    update: updateMutation.mutateAsync,
  }
}

beforeEach(() => vi.clearAllMocks())

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations()
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  expect(screen.getByText('Empty form')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})

it('updates an existing task by id and reports saved changes', async () => {
  const user = userEvent.setup()
  const { create, update } = mockMutations()
  const onSaved = vi.fn()
  const todo = { ...todoFixture, id: 3, title: 'Existing' }
  render(
    <TodoEditor todo={todo} busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  expect(screen.getByText('Form for Existing')).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(update).toHaveBeenCalledWith({ id: 3, input: todoFixture })
  expect(create).not.toHaveBeenCalled()
})

it('keeps the editor open when saving fails', async () => {
  const user = userEvent.setup()
  const { update } = mockMutations({
    update: { mutateAsync: vi.fn().mockRejectedValue(new Error('Nope')) },
  })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
})

it('shows only the error of the mutation matching the editor mode', () => {
  mockMutations({
    create: { error: new Error('Create failed') },
    update: { error: new Error('Update failed') },
  })
  const { rerender } = render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(screen.getByText('Form error: Create failed')).toBeVisible()
  expect(screen.queryByText(/Update failed/)).not.toBeInTheDocument()

  rerender(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(screen.getByText('Form error: Update failed')).toBeVisible()
  expect(screen.queryByText(/Create failed/)).not.toBeInTheDocument()
})

it.each([
  ['the page is busy', true, false],
  ['the mutation is pending', false, true],
])('does not save while %s', async (_, busy, isPending) => {
  const user = userEvent.setup()
  const { create } = mockMutations({ create: { isPending } })
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={busy} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByText('Form busy')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(create).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('closes from both the drawer and the form cancel action', async () => {
  const user = userEvent.setup()
  mockMutations()
  const onClose = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={onClose} onSaved={vi.fn()} />,
  )
  await user.click(screen.getByRole('button', { name: 'Close' }))
  await user.click(screen.getByRole('button', { name: 'Cancel form' }))
  expect(onClose).toHaveBeenCalledTimes(2)
})
