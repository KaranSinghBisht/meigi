import { AddressMutation } from '../ascii/AddressMutation'
import { AgentGate } from '../ascii/AgentGate'
import { FieldReveal } from '../ascii/FieldReveal'
import { HexResolve } from '../ascii/HexResolve'
import { ClosingSection } from './ClosingSection'
import { StorySection } from './StorySection'

/** The four beats under the poster, then the closing line. */
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
        id="story-lookalike"
        headline="One changed character, one lost payment."
        body="A look-alike address keeps the first and last characters people check. The vault compares every character with the registry and refuses anything else, however urgent the invoice sounds."
        tag="AGENTVAULT"
        bracket="MISMATCH · 拒否"
        reverse
      >
        <AddressMutation />
      </StorySection>
      <StorySection
        id="story-agents"
        headline="Agents pay agents."
        body="When an agent buys compute or data over x402, the seller's 402 response says who to pay. Meigi checks that payTo against the registry and the company's ENS name before the agent signs."
        tag="x402 GUARD"
        bracket="REGISTRY · ENS"
      >
        <AgentGate />
      </StorySection>
      <StorySection
        id="story-verified"
        headline="Verified once. Checked on every payment."
        body="A company registers once: its name matched against the National Tax Agency, a signed proof on its own domain, and World ID for each officer. Every payment is then checked against that record, and a new payout waits 72 hours in public."
        tag="REGISTRY"
        bracket="名義 · VERIFY ONCE"
        reverse
      >
        <FieldReveal />
      </StorySection>
      <ClosingSection />
    </div>
  )
}
