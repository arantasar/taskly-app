import { useQuery } from '@tanstack/react-query'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { localIsoDate } from '../utils/todos'

export function useTodoStatsQuery() {
  return useQuery({
    queryKey: todoKeys.stats,
    queryFn: ({ signal }) => todosApi.stats(localIsoDate(), signal),
  })
}
