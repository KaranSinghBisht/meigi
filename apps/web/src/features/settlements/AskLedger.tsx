import { useId, useState, type FormEvent } from 'react'
import { MAX_QUESTION, type AskFailure } from '../../lib/api/ask'
import { TxLink } from '../../ui/components/Address'
import { Button } from '../../ui/components/Button'
import '../../ui/components/field.css'
import { useAskLedger, type AskState } from './useAskLedger'
import './ask.css'

const SUGGESTED = [
  'Who has been paid the most?',
  'How much have agents spent over x402?',
  'What was the most recent payment?',
] as const

const FAILURE: Record<AskFailure, string> = {
  paused: 'Questions are paused until tomorrow (UTC).',
  rate_limited: 'Three questions a minute: try again shortly.',
  invalid_question: `Ask a question of up to ${MAX_QUESTION} characters.`,
  unavailable: "The ledger can't answer right now.",
}

/** The answer as plain text, with the settlements it relies on as transaction links. */
function Reply({ state }: { readonly state: AskState }) {
  if (state.kind === 'idle') return null
  if (state.kind === 'asking') return <p className="ask__note">Reading the settlements…</p>
  if (state.kind === 'failed')
    return state.failure === 'paused' ? null : <p className="ask__note">{FAILURE[state.failure]}</p>
  return (
    <div className="ask__reply">
      <p className="ask__question">{state.question}</p>
      <p className="ask__answer">{state.reply.answer}</p>
      {state.reply.citedTx.length > 0 ? (
        <p className="ask__cited">
          <span>From</span>
          {state.reply.citedTx.map((tx) => (
            <TxLink key={tx} hash={tx} />
          ))}
        </p>
      ) : null}
    </div>
  )
}

function Suggested({ disabled, onPick }: { readonly disabled: boolean; readonly onPick: (text: string) => void }) {
  return (
    <div className="ask__suggested">
      {SUGGESTED.map((text) => (
        <button key={text} type="button" className="ask__chip" disabled={disabled} onClick={() => onPick(text)}>
          {text}
        </button>
      ))}
    </div>
  )
}

/**
 * "Ask the ledger": a question about the settlements above, answered only from them by the site's Worker (Workers AI,
 * checked before it is shown). Read-only; greyed out calmly once the day's questions are used up.
 */
export function AskLedger() {
  const id = useId()
  const [question, setQuestion] = useState('')
  const { state, shown, paused, ask } = useAskLedger()
  const busy = state.kind === 'asking'
  const send = (text: string) => {
    const trimmed = text.trim()
    if (trimmed && !paused && !busy) void ask(trimmed)
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    send(question)
  }
  const pick = (text: string) => {
    setQuestion(text)
    send(text)
  }
  if (!shown) return null
  return (
    <form className={paused ? 'ask ask--paused' : 'ask'} onSubmit={submit} aria-labelledby={id}>
      <h3 id={id} className="ask__title">
        Ask the ledger
      </h3>
      <Suggested disabled={paused || busy} onPick={pick} />
      <div className="ask__row">
        <label className="sr-only" htmlFor={`${id}-q`}>
          Your question about these settlements
        </label>
        <input
          id={`${id}-q`}
          className="input"
          value={question}
          maxLength={MAX_QUESTION}
          disabled={paused}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="Ask about these settlements"
          autoComplete="off"
        />
        <Button type="submit" busy={busy} disabled={paused || !question.trim()}>
          Ask
        </Button>
      </div>
      {paused ? <p className="ask__note">{FAILURE.paused}</p> : null}
      <div aria-live="polite">
        <Reply state={state} />
      </div>
      <p className="ask__disclosure">Answers come only from the settlements above, indexed by Curvegrid MultiBaas.</p>
    </form>
  )
}
