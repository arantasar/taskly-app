import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

describe('TodoForm', () => {
  it('rejects a whitespace-only title without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '   ')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values and the selected priority', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Prepare a demo',
      description: '',
      priority: 'high',
      due_date: null,
      completed: false,
    })
  })

  it('prefills an existing task and submits edited description and due date', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={{ ...todoFixture, description: 'Old', due_date: '2026-10-05' }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    expect(screen.getByLabelText(/Task title/)).toHaveValue(todoFixture.title)
    expect(screen.getByLabelText('Due date (optional)')).toHaveValue(
      '2026-10-05',
    )
    const description = screen.getByLabelText('Description (optional)')
    await user.clear(description)
    await user.type(description, '  New notes  ')
    await user.clear(screen.getByLabelText('Due date (optional)'))
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'New notes', due_date: null }),
    )
  })

  it('submits a chosen due date', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), 'Dated')
    await user.type(screen.getByLabelText('Due date (optional)'), '2026-11-02')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Dated', due_date: '2026-11-02' }),
    )
  })

  it('shows a server error and cancels without submitting', async () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={onCancel}
        busy={false}
        error="Task not found."
      />,
    )
    expect(screen.getByTestId('alert')).toHaveTextContent('Task not found.')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('locks fields and actions while saving', () => {
    render(<TodoForm onSubmit={vi.fn()} onCancel={vi.fn()} busy error={null} />)
    expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Task title/)).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })
})
