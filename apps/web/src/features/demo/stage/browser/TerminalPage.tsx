import { X402_RUN } from '../../content/x402'
import { terminalLines } from '../../content/x402Lines'

/** Chapter 5's tab: the research agent's log, one line per request, 402 and guard decision. */
export function TerminalPage() {
  const lines = terminalLines(X402_RUN)
  return (
    <div className="term" data-d="term" data-enter="">
      <p className="term__head">
        <span>{X402_RUN.buyer}</span>
        <span className="term__meta">x402 · Meigi guard · Sepolia</span>
        {X402_RUN.placeholder ? <span className="term__placeholder">placeholder run</span> : null}
      </p>
      <div className="term__view" data-d="term-view">
        <ol className="term__lines" data-d="term-lines">
          {lines.map((line) => (
            <li key={line.id} className={`term__line term__line--${line.tone}`} data-d={`term-${line.id}`}>
              <span className="typed">
                <span className="typed__ghost" aria-hidden="true">
                  {line.text}
                </span>
                <span className="typed__live" data-d={`term-${line.id}-text`} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
