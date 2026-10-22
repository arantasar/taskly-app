import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo, TodoInput } from '../types'

const base: Todo = {
  id: 1,
  title: 'Sprint plan',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
  created_at: '2026-10-01T12:00:00Z',
  updated_at: '2026-10-01T12:00:00Z',
}

describe('selectTodos', () => {
  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...base, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...base, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...base, id: 2, priority: 'high' }
    const todos = [base, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([high, base])
    expect(todos).toEqual([base, high])
  })

  it('keeps only completed tasks for the completed filter and matches titles', () => {
    const done = { ...base, id: 2, title: 'Ship release', completed: true }
    const todos = [base, done, { ...done, id: 3, title: 'Other' }]
    expect(selectTodos(todos, 'completed', 'SHIP', 'newest')).toEqual([done])
  })

  it('breaks priority ties by newest id first', () => {
    const second = { ...base, id: 2 }
    const low: Todo = { ...base, id: 3, priority: 'low' }
    expect(selectTodos([base, low, second], 'all', '', 'priority')).toEqual([
      second,
      base,
      low,
    ])
  })

  it('sorts by due date ascending with undated tasks last and ties by id', () => {
    const early = { ...base, id: 2, due_date: '2026-10-03' }
    const late = { ...base, id: 3, due_date: '2026-11-01' }
    const earlyTwin = { ...base, id: 4, due_date: '2026-10-03' }
    const undated = { ...base, id: 5 }
    expect(
      selectTodos([base, late, undated, early, earlyTwin], 'all', '', 'due'),
    ).toEqual([earlyTwin, early, late, undated, base])
  })

  it('sorts newest by creation time, then by id', () => {
    const older = { ...base, id: 5, created_at: '2026-09-01T12:00:00Z' }
    const sameTime = { ...base, id: 2 }
    expect(selectTodos([older, base, sameTime], 'all', '', 'newest')).toEqual([
      sameTime,
      base,
      older,
    ])
  })
})

describe('validateTodo', () => {
  const valid: TodoInput = {
    title: 'Task',
    description: '',
    priority: 'medium',
    due_date: null,
    completed: false,
  }

  it('accepts a minimal valid task and a real calendar date', () => {
    expect(validateTodo(valid)).toEqual({})
    expect(validateTodo({ ...valid, due_date: '2028-02-29' })).toEqual({})
  })

  it.each([
    ['blank', '   ', 'Enter a task title.'],
    ['too long', 'x'.repeat(121), 'The title must be at most 120 characters.'],
  ])('rejects a %s title', (_, title, message) => {
    expect(validateTodo({ ...valid, title })).toEqual({ title: message })
  })

  it('measures limits after trimming surrounding whitespace', () => {
    expect(
      validateTodo({
        ...valid,
        title: ` ${'x'.repeat(120)} `,
        description: ` ${'d'.repeat(2000)} `,
      }),
    ).toEqual({})
  })

  it('rejects a description longer than 2000 characters', () => {
    expect(validateTodo({ ...valid, description: 'd'.repeat(2001) })).toEqual({
      description: 'The description must be at most 2000 characters.',
    })
  })

  it.each(['2026-02-30', '2026-13-01', '2026-1-01', 'tomorrow'])(
    'rejects the invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...valid, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('reports every invalid field at once', () => {
    expect(
      Object.keys(
        validateTodo({
          ...valid,
          title: '',
          description: 'd'.repeat(2001),
          due_date: 'bad',
        }),
      ),
    ).toEqual(['title', 'description', 'due_date'])
  })
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 23, 30))
  })
  afterEach(() => vi.useRealTimers())

  it.each([
    ['due before today', { due_date: '2026-10-14' }, true],
    ['due today', { due_date: '2026-10-15' }, false],
    ['due in the future', { due_date: '2026-10-16' }, false],
    ['without a due date', { due_date: null }, false],
    [
      'completed in the past',
      { due_date: '2026-10-01', completed: true },
      false,
    ],
  ])('handles a task %s', (_, overrides, expected) => {
    expect(isOverdue({ ...base, ...overrides })).toBe(expected)
  })
})

describe('formatDate', () => {
  it('formats an ISO date as a short British date', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })
})
