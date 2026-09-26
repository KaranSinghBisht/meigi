import { shortAddress } from '../../../../lib/chain/format'
import { HankoMark } from '../../../../ui/brand/HankoMark'
import { LOG_LINES, VAULT } from '../../content/chainLog'
import { MAILBOX } from '../../content/inbox'
import { BecCards } from './BecCards'
import { Chip, Scene, type Tone } from './parts'
import { UrgentCards } from './UrgentCards'
import { X402Cards } from './X402Cards'
import './panel.css'
import './cards.css'

/** The header's status chips; the timeline shows one at a time. */
const STATUS: readonly { readonly id: string; readonly tone: Tone; readonly label: string }[] = [
  { id: 'idle', tone: 'muted', label: 'Watching' },
  { id: 'new', tone: 'info', label: 'New mail from a supplier' },
  { id: 'reading', tone: 'ink', label: 'Reading' },
  { id: 'hold', tone: 'hold', label: 'Held' },
  { id: 'refused', tone: 'bad', label: 'Refused by the vault' },
  { id: 'draft', tone: 'info', label: 'Draft reply ready for review' },
  { id: 'human', tone: 'hold', label: 'Waiting for a verified human' },
  { id: 'paid', tone: 'ok', label: 'Paid' },
  { id: 'x402', tone: 'ink', label: 'Guarding x402 payments' },
]

function Head() {
  return (
    <header className="apanel__head">
      <HankoMark size={32} />
      <div className="apanel__who">
        <p className="apanel__name">ap.meigi.eth</p>
        <p className="apanel__sub mono" title={`Watching ${MAILBOX.owner}`}>
          {MAILBOX.owner}
        </p>
      </div>
      <div className="apanel__status">
        {STATUS.map((status) => (
          <span
            key={status.id}
            className="apanel__status-chip"
            data-d={`status-${status.id}`}
            data-enter={status.id === 'idle' ? undefined : ''}
          >
            <Chip tone={status.tone}>{status.label}</Chip>
          </span>
        ))}
      </div>
    </header>
  )
}

function ChainLog() {
  return (
    <section className="plog">
      <p className="plog__head">
        <span>Chain log</span>
        <span className="mono">AgentVault {shortAddress(VAULT)} · Sepolia</span>
      </p>
      <div className="plog__view" data-d="log-view">
        <p className="plog__idle" data-d="log-idle">
          Nothing sent yet.
        </p>
        <ol className="plog__lines" data-d="log-stack">
          {LOG_LINES.map((line) => (
            <li key={line.id} className={`plog__line plog__line--${line.tone}`} data-d={`log-${line.id}`} data-enter="">
              <span className="typed">
                <span className="typed__ghost" aria-hidden="true">
                  {line.text}
                </span>
                <span className="typed__live" data-d={`log-${line.id}-text`} />
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

/** The Meigi agent beside the mail: the pipeline filling in, and the chain log underneath. */
export function AgentPanel() {
  return (
    <aside className="apanel" data-d="panel">
      <Head />
      <div className="apanel__scenes">
        <Scene id="bec" steps={['Read', 'Triage', 'Belief', 'Kernel', 'Screen', 'Decide']}>
          <BecCards />
        </Scene>
        <Scene id="urgent" steps={['Read', 'Triage', 'Kernel', 'Decide', 'Human', 'Pay']} hidden>
          <UrgentCards />
        </Scene>
        <Scene id="x402" steps={['402', 'ENS', 'Registry', 'Screen', 'Sign', 'Settle']} hidden>
          <X402Cards />
        </Scene>
      </div>
      <ChainLog />
    </aside>
  )
}
