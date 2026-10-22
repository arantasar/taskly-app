import { Plus } from 'lucide-react'
import { Badge, Button, Heading, Text } from '../../../design-system'

export function TodosHeader({
  disabled,
  overdue = 0,
  onCreate,
}: {
  disabled: boolean
  overdue?: number
  onCreate: () => void
}) {
  return (
    <section className="row spread" aria-labelledby="page-title">
      <div className="stack compact">
        <div className="row">
          <Heading id="page-title">Tasks</Heading>
          {overdue > 0 && (
            <Badge variant="warning" role="status">
              {overdue === 1 ? '1 overdue task' : `${overdue} overdue tasks`}
            </Badge>
          )}
        </div>
        <Text muted>Create, organize, and complete tasks.</Text>
      </div>
      <Button disabled={disabled} onClick={onCreate}>
        <Plus size={18} aria-hidden="true" />
        New task
      </Button>
    </section>
  )
}
