import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})

describe('with details and dates', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 15, 12))
  })
  afterEach(() => vi.useRealTimers())

  it('shows the description, priority and an overdue due date', () => {
    const todo: Todo = {
      ...todoFixture,
      description: 'Bring slides',
      priority: 'high',
      due_date: '2026-10-14',
    }
    render(
      <TodoItem
        todo={todo}
        busy={false}
        onEdit={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('Bring slides')).toBeVisible()
    expect(screen.getByText('High')).toBeVisible()
    expect(screen.getByText(`#${todo.id}`)).toBeVisible()
    expect(screen.getByText(/14 Oct 2026/)).toHaveTextContent(
      '14 Oct 2026 · overdue',
    )
  })

  it('shows an upcoming due date without the overdue marker', () => {
    render(
      <TodoItem
        todo={{ ...todoFixture, due_date: '2026-10-20' }}
        busy={false}
        onEdit={vi.fn()}
        onToggle={vi.fn()}
        onDelete={vi.fn()}
      />,
    )
    expect(screen.getByText('20 Oct 2026')).toBeVisible()
    expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
  })
})

it('omits the description and due date when absent', () => {
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(screen.queryAllByRole('paragraph')).toHaveLength(0)
  expect(screen.queryByText(/\d{1,2} \w{3} \d{4}/)).not.toBeInTheDocument()
})

it('shows a completed task and forwards toggle and delete requests', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  const todo = { ...todoFixture, completed: true }
  render(
    <TodoItem
      todo={todo}
      busy={false}
      onEdit={vi.fn()}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByText('Completed')).toBeVisible()
  const checkbox = screen.getByRole('checkbox', {
    name: `Mark as active: ${todo.title}`,
  })
  expect(checkbox).toBeChecked()
  await user.click(checkbox)
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todo.title}` }),
  )
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onDelete).toHaveBeenCalledTimes(1)
})

it('disables every action while busy', () => {
  render(
    <TodoItem
      todo={todoFixture}
      busy
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
    />,
  )
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).toBeDisabled()
  for (const button of screen.getAllByRole('button')) {
    expect(button).toBeDisabled()
  }
})
