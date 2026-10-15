import { Button, usePersisted } from '../../shared/ui/ui.tsx'
import { LABEL_TYPES } from './labelTypes.ts'

export default function LabelMakerPage() {
  const [tab, setTab] = usePersisted<{ id: string }>('wa.label.tab', { id: LABEL_TYPES[0].id })
  const active = LABEL_TYPES.find((t) => t.id === tab.id) ?? LABEL_TYPES[0]
  const Active = active.component
  return (
    <div className="space-y-4">
      <div className="no-print -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist">
        {LABEL_TYPES.map((t) => (
          <Button key={t.id} role="tab" aria-selected={t.id === active.id} kind={t.id === active.id ? 'primary' : 'secondary'} className="shrink-0 whitespace-nowrap" onClick={() => setTab({ id: t.id })}>
            {t.label}
          </Button>
        ))}
      </div>
      <Active key={active.id} />
    </div>
  )
}
