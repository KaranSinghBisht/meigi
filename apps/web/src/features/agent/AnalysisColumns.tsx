import type { Analysis } from '../../lib/api/agentTypes'
import { BeliefColumn } from './columns/BeliefColumn'
import { ExtractionColumn } from './columns/ExtractionColumn'
import { KernelColumn } from './columns/KernelColumn'
import { ScreeningColumn } from './columns/ScreeningColumn'
import { TriageColumn } from './columns/TriageColumn'
import './columns/columns.css'

/** The five stages side by side, in the order the agent runs them. */
export function AnalysisColumns({ analysis }: { readonly analysis: Analysis }) {
  return (
    <div className="cols">
      <ExtractionColumn extracted={analysis.extracted} />
      <TriageColumn triage={analysis.triage} />
      <KernelColumn kernel={analysis.kernel} />
      <ScreeningColumn screening={analysis.screening} />
      <BeliefColumn proposal={analysis.proposal} />
    </div>
  )
}
