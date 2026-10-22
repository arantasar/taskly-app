import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

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

it.each([
  ['omitted', undefined],
  ['zero', 0],
])('shows no overdue status when the count is %s', (_, overdue) => {
  render(<TodosHeader disabled={false} overdue={overdue} onCreate={vi.fn()} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it.each([
  [1, '1 overdue task'],
  [3, '3 overdue tasks'],
])('announces %i overdue task(s)', (overdue, text) => {
  render(<TodosHeader disabled={false} overdue={overdue} onCreate={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent(text)
})
