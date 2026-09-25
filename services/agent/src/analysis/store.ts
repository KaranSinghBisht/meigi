import type { PaymentIntent } from "../kernel/intent.js";
import type { AnalysisView } from "./analyze.js";
import type { PayResult } from "./pay.js";
import type { Verdict } from "./verdict.js";

/** One analysed document: the API view plus what paying it needs. */
export interface StoredAnalysis {
  view: AnalysisView;
  intent: PaymentIntent | null;
  verdict: Verdict;
  payment: PayResult | null;
}

/** In-memory, newest-kept store. Analyses are cheap to redo, so nothing is persisted. */
export class AnalysisStore {
  private readonly items = new Map<string, StoredAnalysis>();

  constructor(private readonly capacity = 500) {}

  save(analysis: StoredAnalysis): void {
    this.items.delete(analysis.view.id);
    this.items.set(analysis.view.id, analysis);
    while (this.items.size > this.capacity) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
  }

  get(id: string): StoredAnalysis | undefined {
    return this.items.get(id);
  }
}
