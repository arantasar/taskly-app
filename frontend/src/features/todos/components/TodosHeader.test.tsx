import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it.each([
  [undefined, null],
  [0, null],
  [1, '1 overdue task'],
  [4, '4 overdue tasks'],
])('shows the overdue badge for %s overdue tasks', (overdue, text) => {
  render(<TodosHeader disabled={false} overdue={overdue} onCreate={vi.fn()} />)
  const badge = screen.queryByRole('status')
  if (text === null) {
    expect(badge).not.toBeInTheDocument()
  } else {
    expect(badge).toHaveTextContent(text)
  }
})

it('invokes creation when enabled and blocks it when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodosHeader disabled={false} onCreate={onCreate} />,
  )
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  expect(
    screen.getByText('Create, organize, and complete tasks.'),
  ).toBeVisible()
  const button = screen.getByRole('button', { name: 'New task' })
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(<TodosHeader disabled onCreate={onCreate} />)
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
})
