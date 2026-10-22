import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { useTodoFilters } from './useTodoFilters'

const active: Todo = { ...todoFixture, id: 1, title: 'Write docs' }
const done: Todo = {
  ...todoFixture,
  id: 2,
  title: 'Ship release',
  priority: 'high',
  completed: true,
}
const low: Todo = { ...todoFixture, id: 3, title: 'Tidy up', priority: 'low' }

it('starts with all tasks, no search and newest first', () => {
  const { result } = renderHook(() => useTodoFilters([active, done, low]))
  expect(result.current).toMatchObject({
    filter: 'all',
    search: '',
    sort: 'newest',
  })
  expect(result.current.visible).toEqual([low, done, active])
})

it('recomputes the visible tasks when filter, search and sort change', () => {
  const { result } = renderHook(() => useTodoFilters([active, done, low]))

  act(() => result.current.setFilter('active'))
  expect(result.current.visible).toEqual([low, active])

  act(() => result.current.setSort('priority'))
  expect(result.current.visible).toEqual([active, low])

  act(() => result.current.setSearch('docs'))
  expect(result.current.visible).toEqual([active])
  expect(result.current).toMatchObject({
    filter: 'active',
    search: 'docs',
    sort: 'priority',
  })
})

it('reflects new tasks passed on rerender while keeping the filters', () => {
  const { result, rerender } = renderHook(
    ({ todos }) => useTodoFilters(todos),
    { initialProps: { todos: [active] } },
  )
  act(() => result.current.setFilter('completed'))
  expect(result.current.visible).toEqual([])

  rerender({ todos: [active, done] })
  expect(result.current.visible).toEqual([done])
})
