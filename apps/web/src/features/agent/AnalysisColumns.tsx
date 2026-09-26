import type { Analysis } from '../../lib/api/agentTypes'
import { BeliefColumn } from './columns/BeliefColumn'
import { ExtractionColumn } from './columns/ExtractionColumn'
import { KernelColumn } from './columns/KernelColumn'
import { ScreeningColumn } from './columns/ScreeningColumn'
import { TriageColumn } from './columns/TriageColumn'
import './columns/pipeline.css'
import './columns/columns.css'

/** The five stages side by side, in the order the agent runs them. */
export function AnalysisColumns({ analysis }: { readonly analysis: Analysis }) {
  return (
    <div className="cols cells window window--dense">
      <ExtractionColumn extracted={analysis.extracted} />
      <TriageColumn triage={analysis.triage} />
      <KernelColumn kernel={analysis.kernel} overallHold={analysis.verdict.decision === 'hold'} />
      <ScreeningColumn
        screening={analysis.screening}
        holds={analysis.verdict.reasons.some((reason) => reason.code === 'screening_unavailable')}
      />
      <BeliefColumn proposal={analysis.proposal} />
    </div>
  )
}
