import { AddressMutation } from '../ascii/AddressMutation'
import { AgentGate } from '../ascii/AgentGate'
import { FieldReveal } from '../ascii/FieldReveal'
import { HexResolve } from '../ascii/HexResolve'
import { NameOutlivesKeys } from '../ascii/NameOutlivesKeys'
import { ClosingSection } from './ClosingSection'
import { StorySection } from './StorySection'

/** The five beats under the poster, then the closing line. */
export function Story() {
  return (
    <div className="home__story">
      <StorySection
        id="story-string"
        headline="An address is just a string."
        body="Forty-two characters nobody reads. Meigi gives it a name: a company's public T-number resolves to the one address it can be paid at, in the registry and in any wallet that reads ENS."
        tag="PAYEE LOOKUP"
        bracket="T-NUMBER · ENS"
      >
        <HexResolve />
      </StorySection>
      <StorySection
        id="story-names"
        headline="A name that outlives its keys."
        body={
          <>
            t2011001234567.payee.eth stays{' '}
            <span className="nowrap" lang="ja">
              株式会社メイギ商事
            </span>{' '}
            while the address beneath it changes, and only ever through a 72-hour window in public. ap.meigi.eth stays
            the AP agent, whatever key operates it.
          </>
        }
        tag="ENS"
        bracket="NAMESPACE · KEYS ROTATE"
        reverse
      >
        <NameOutlivesKeys />
      </StorySection>
      <StorySection
        id="story-lookalike"
        headline="One changed character, one lost payment."
        body="A look-alike address keeps the first and last characters people check. The vault compares every character with the registry and refuses anything else, however urgent the invoice sounds."
        tag="AGENTVAULT"
        bracket="MISMATCH · 拒否"
      >
        <AddressMutation />
      </StorySection>
      <StorySection
        id="story-agents"
        headline="Agents pay agents."
        body="When an agent buys compute or data over x402, the seller's 402 response says who to pay. Meigi checks that payTo against the registry and the company's ENS name before the agent signs."
        tag="x402 GUARD"
        bracket="REGISTRY · ENS"
        reverse
      >
        <AgentGate />
      </StorySection>
      <StorySection
        id="story-registered"
        headline="Registered once. Checked on every payment."
        body="A company registers once: its name matched against the National Tax Agency, a signed proof on a domain it controls, and World ID for each officer. Every payment is then checked against that record, and a new payout waits 72 hours in public."
        tag="REGISTRY"
        bracket="名義 · REGISTER ONCE"
      >
        <FieldReveal />
      </StorySection>
      <ClosingSection />
    </div>
  )
}
