import { HankoMark } from '../../../../ui/brand/HankoMark'
import { LOG_GROUPS, type LogGroup } from '../../content/chainLog'
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
  { id: 'human', tone: 'hold', label: 'Waiting for World ID approval' },
  { id: 'approved', tone: 'ok', label: 'Approved with World ID' },
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

function Idle() {
  return (
    <>
      <p className="pidle__title">Watching the inbox</p>
      <p className="pidle__text">
        Each new mail is read here first. Money moves only through the AgentVault, and only to a registered payout.
      </p>
    </>
  )
}

function LogLines({ group }: { readonly group: LogGroup }) {
  return (
    <ol className="plog__lines" data-d={`log-stack-${group.id}`}>
      {group.lines.map((line) => (
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
  )
}

/** One group of lines per chapter, shown one at a time, so each chapter's log tells only its own story. */
function ChainLog() {
  return (
    <section className="plog">
      <p className="plog__head">
        <span>Chain log</span>
        <span className="plog__where">
          {LOG_GROUPS.map((group) => (
            <span
              key={group.id}
              className="mono"
              data-d={`log-where-${group.id}`}
              data-enter={group.id === LOG_GROUPS[0]?.id ? undefined : ''}
            >
              {group.where}
            </span>
          ))}
        </span>
      </p>
      <div className="plog__view" data-d="log-view">
        <p className="plog__idle" data-d="log-idle">
          Nothing sent yet.
        </p>
        {LOG_GROUPS.map((group) => (
          <div key={group.id} className="plog__group" data-d={`log-group-${group.id}`} data-enter="">
            <LogLines group={group} />
          </div>
        ))}
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
        <Scene id="bec" steps={['Read', 'Triage', 'Belief', 'Kernel', 'Screen', 'Decide']} idle={<Idle />}>
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
