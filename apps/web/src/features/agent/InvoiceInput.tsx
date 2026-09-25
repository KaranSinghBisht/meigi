import { useId, type FormEvent } from 'react'
import { Button } from '../../ui/components/Button'
import type { AgentConsole } from './useAgentConsole'
import './agent.css'

/** The document the agent reads: paste anything, or start from an example. */
export function InvoiceInput({ agent }: { readonly agent: AgentConsole }) {
  const id = useId()
  const { examples } = agent
  const analyzing = agent.analysis.kind === 'analyzing'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void agent.analyze()
  }

  return (
    <form className="invoice" onSubmit={submit}>
      <div className="invoice__examples" role="group" aria-labelledby={`${id}-examples`}>
        <span id={`${id}-examples`} className="invoice__examples-label">
          Examples{examples.source === 'built-in' ? ' (built in)' : ''}
        </span>
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
      <label htmlFor={id} className="sr-only">
        Invoice, email or x402 response for the agent to read
      </label>
      <textarea
        id={id}
        className="invoice__text"
        value={agent.text}
        onChange={(event) => agent.setText(event.target.value)}
        placeholder="Paste an invoice, a bank-change email, or an x402 402-response. Try to make the agent pay the wrong address."
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
