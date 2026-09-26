import { useId, useRef, type FormEvent } from 'react'
import { Button } from '../../ui/components/Button'
import { useScrollFade } from '../../ui/components/useScrollFade'
import type { AgentConsole } from './useAgentConsole'
import './agent.css'
import './invoice.css'

/** The example documents: chips beside their label, or one sideways-scrolling row on a phone. */
function ExampleChips({ agent }: { readonly agent: AgentConsole }) {
  const id = useId()
  const strip = useRef<HTMLDivElement>(null)
  const { examples } = agent
  useScrollFade(strip, examples.list.length)
  return (
    <div className="invoice__examples" role="group" aria-labelledby={id}>
      <span id={id} className="invoice__examples-label">
        Try an example{examples.source === 'built-in' ? ' (built in)' : ''}
      </span>
      <div ref={strip} className="invoice__example-list scroll-fade">
        {examples.list.map((example) => (
          <button
            key={example.id}
            type="button"
            className="invoice__example"
            title={example.note ?? undefined}
            disabled={agent.busy}
            onClick={() => agent.load(example)}
          >
            {example.title}
          </button>
        ))}
      </div>
    </div>
  )
}

/** The document the agent reads: paste anything, or start from an example. */
export function InvoiceInput({ agent }: { readonly agent: AgentConsole }) {
  const id = useId()
  const analyzing = agent.analysis.kind === 'analyzing'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void agent.analyze()
  }

  return (
    <form className="invoice" onSubmit={submit}>
      <ExampleChips agent={agent} />
      <label htmlFor={id} className="sr-only">
        Invoice, email or x402 response for the agent to read
      </label>
      <textarea
        id={id}
        className="invoice__text"
        value={agent.text}
        onChange={(event) => agent.setText(event.target.value)}
        placeholder="Paste an invoice, a supplier email or an x402 402-response."
        spellCheck={false}
      />
      <div className="invoice__actions">
        <Button type="submit" size="xl" busy={analyzing} disabled={!agent.text.trim() || agent.busy}>
          {analyzing ? 'Reading…' : 'Analyze'}
        </Button>
        <p className="invoice__hint">Only the deterministic kernel can move money. The LLM only proposes.</p>
      </div>
    </form>
  )
}
