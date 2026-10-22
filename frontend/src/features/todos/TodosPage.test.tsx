import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { todoFixture } from '../../test/todoFixture'
import { DeleteTodoDialog } from './components/DeleteTodoDialog'
import { TodoEditor } from './components/TodoEditor'
import { TodoList } from './components/TodoList'
import { TodosHeader } from './components/TodosHeader'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { TodosPage } from './TodosPage'
import type { Todo } from './types'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: vi.fn(() => <h1>Tasks</h1>),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: vi.fn(() => <p>Task list</p>),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: vi.fn(({ todo }: { todo: Todo | 'new' }) => (
    <p>Editor for {todo === 'new' ? 'a new task' : todo.title}</p>
  )),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: vi.fn(({ todo }: { todo: Todo }) => (
    <p>Deleting {todo.title}</p>
  )),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

const listProps = () => vi.mocked(TodoList).mock.lastCall![0]
const headerProps = () => vi.mocked(TodosHeader).mock.lastCall![0]
const editorProps = () => vi.mocked(TodoEditor).mock.lastCall![0]
const dialogProps = () => vi.mocked(DeleteTodoDialog).mock.lastCall![0]

function setup({
  query = {},
  mutation = {},
  busy = false,
}: {
  query?: Record<string, unknown>
  mutation?: Record<string, unknown>
  busy?: boolean
} = {}) {
  const todos = [todoFixture]
  const queryResult = {
    data: todos,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...query,
  }
  const mutationResult = {
    error: null,
    reset: vi.fn(),
    mutateAsync: vi.fn(),
    ...mutation,
  }
  const notify = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue(
    queryResult as unknown as ReturnType<typeof useTodosQuery>,
  )
  vi.mocked(useUpdateTodoMutation).mockReturnValue(
    mutationResult as unknown as ReturnType<typeof useUpdateTodoMutation>,
  )
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: todos,
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  return { notify, mutateAsync: mutationResult.mutateAsync, queryResult }
}

beforeEach(() => vi.clearAllMocks())

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})

it('passes loaded tasks and state to the list without an alert', () => {
  setup()
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  expect(useTodoFilters).toHaveBeenCalledWith([todoFixture])
  expect(listProps()).toMatchObject({
    todos: [todoFixture],
    hasTodos: true,
    loading: false,
    failed: false,
    busy: false,
  })
  expect(headerProps().disabled).toBe(false)
})

it('treats a pending query without data as an empty, loading list', () => {
  setup({ query: { data: undefined, isPending: true } })
  expect(useTodoFilters).toHaveBeenCalledWith([])
  expect(listProps()).toMatchObject({ hasTodos: false, loading: true })
  expect(headerProps().disabled).toBe(true)
})

it('disables creating and retrying while another task mutation runs', () => {
  setup({ busy: true, query: { error: new Error('Offline') } })
  expect(headerProps().disabled).toBe(true)
  expect(listProps().busy).toBe(true)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('shows a toggle error in preference to the query error', () => {
  setup({
    query: { error: new Error('Query failed') },
    mutation: { error: new Error('Toggle failed') },
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('Toggle failed')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Query failed')
})

it.each([
  [false, true, 'Another task complete. Well done!'],
  [true, false, 'Task marked as active.'],
])(
  'toggles a task with completed=%s and announces the saved state',
  async (completed, savedCompleted, message) => {
    const todo = { ...todoFixture, completed }
    const { mutateAsync, notify } = setup({
      mutation: {
        mutateAsync: vi
          .fn()
          .mockResolvedValue({ ...todo, completed: savedCompleted }),
      },
    })
    act(() => listProps().onToggle(todo))
    await waitFor(() => expect(notify).toHaveBeenCalledWith(message))
    expect(mutateAsync).toHaveBeenCalledWith({
      id: todo.id,
      input: { completed: !completed },
    })
  },
)

it('does not announce anything when toggling fails', async () => {
  const { mutateAsync, notify } = setup({
    mutation: { mutateAsync: vi.fn().mockRejectedValue(new Error('Nope')) },
  })
  act(() => listProps().onToggle(todoFixture))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(notify).not.toHaveBeenCalled()
})

it('ignores toggles while another task mutation runs', () => {
  const { mutateAsync } = setup({ busy: true })
  act(() => listProps().onToggle(todoFixture))
  expect(mutateAsync).not.toHaveBeenCalled()
})

it('opens the editor for a new task from the header and from the list', () => {
  setup()
  expect(screen.queryByText(/Editor for/)).not.toBeInTheDocument()
  act(() => headerProps().onCreate())
  expect(screen.getByText('Editor for a new task')).toBeVisible()

  act(() => editorProps().onClose())
  expect(screen.queryByText(/Editor for/)).not.toBeInTheDocument()

  act(() => listProps().onCreate())
  expect(screen.getByText('Editor for a new task')).toBeVisible()
})

it('edits a task from the list and announces the save', () => {
  const { notify } = setup({ busy: true })
  act(() => listProps().onEdit(todoFixture))
  expect(screen.getByText(`Editor for ${todoFixture.title}`)).toBeVisible()
  expect(editorProps().busy).toBe(true)

  act(() => editorProps().onSaved('Changes saved.'))
  expect(screen.queryByText(/Editor for/)).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Changes saved.')
})

it('confirms deletion of a task and announces it once deleted', () => {
  const { notify } = setup()
  expect(screen.queryByText(/Deleting/)).not.toBeInTheDocument()
  act(() => listProps().onDelete(todoFixture))
  expect(screen.getByText(`Deleting ${todoFixture.title}`)).toBeVisible()
  expect(dialogProps().busy).toBe(false)

  act(() => dialogProps().onDeleted())
  expect(screen.queryByText(/Deleting/)).not.toBeInTheDocument()
  expect(notify).toHaveBeenCalledWith('Task deleted.')
})

it('closes the delete confirmation without announcing anything', () => {
  const { notify } = setup()
  act(() => listProps().onDelete(todoFixture))
  act(() => dialogProps().onClose())
  expect(screen.queryByText(/Deleting/)).not.toBeInTheDocument()
  expect(notify).not.toHaveBeenCalled()
})
