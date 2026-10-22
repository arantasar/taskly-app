import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: ({
    hasTodos,
    disabled,
    onCreate,
  }: {
    hasTodos: boolean
    disabled: boolean
    onCreate: () => void
  }) => (
    <button disabled={disabled} onClick={onCreate}>
      {hasTodos ? 'Empty filtered list' : 'Empty task list'}
    </button>
  ),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title}
      {busy && ' (busy)'}
      <button onClick={onToggle}>Toggle {todo.title}</button>
      <button onClick={onEdit}>Edit {todo.title}</button>
      <button onClick={onDelete}>Delete {todo.title}</button>
    </li>
  ),
}))

const props = {
  todos: [],
  hasTodos: false,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

beforeEach(() => vi.clearAllMocks())

it('shows loading feedback before showing an empty list', () => {
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})

it('shows an unavailable message when loading failed and nothing is cached', () => {
  render(<TodoList {...props} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.getByText('Try again to load your tasks.')).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('keeps showing cached tasks when a refetch failed', () => {
  render(<TodoList {...props} todos={[todoFixture]} hasTodos failed />)
  expect(screen.getByRole('listitem')).toHaveTextContent(todoFixture.title)
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
})

it('renders one item per visible task and wires each callback to its task', async () => {
  const user = userEvent.setup()
  const other: Todo = { ...todoFixture, id: 8, title: 'Other task' }
  render(<TodoList {...props} todos={[todoFixture, other]} hasTodos busy />)
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByText(/Other task \(busy\)/)).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Toggle Other task' }))
  await user.click(
    screen.getByRole('button', { name: `Edit ${todoFixture.title}` }),
  )
  await user.click(screen.getByRole('button', { name: 'Delete Other task' }))

  expect(props.onToggle).toHaveBeenCalledWith(other)
  expect(props.onEdit).toHaveBeenCalledWith(todoFixture)
  expect(props.onDelete).toHaveBeenCalledWith(other)
})

it('passes filtering context, busy state and create action to the empty state', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<TodoList {...props} hasTodos />)
  expect(screen.getByText('Empty filtered list')).toBeVisible()

  rerender(<TodoList {...props} busy />)
  expect(screen.getByRole('button', { name: 'Empty task list' })).toBeDisabled()

  rerender(<TodoList {...props} />)
  await user.click(screen.getByRole('button', { name: 'Empty task list' }))
  expect(props.onCreate).toHaveBeenCalledTimes(1)
})
