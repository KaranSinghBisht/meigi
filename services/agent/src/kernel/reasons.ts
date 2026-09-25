/** Machine-readable reasons shared by every layer. `block` holds the payment; `warn` is shown only. */

export type Layer = "extraction" | "intent" | "kernel" | "triage" | "screening";

export interface Reason {
  code: string;
  severity: "block" | "warn";
  layer: Layer;
  tNumber: string | null; // "T" + 13 digits
  legalName: string | null; // the registry's legal name for tNumber, when it has one
  message: string; // written by us from checked values; never quotes the document
  evidence?: string; // document or model text behind the reason, for the console only (never sent to a model)
  revert?: string; // the custom error the chain raises for the same condition
}

/** One kernel check. `ok` checks are kept too, so the console can show the whole checklist. */
export interface CheckResult {
  code: string;
  ok: boolean;
  severity: "block" | "warn";
  message: string;
  evidence?: string;
  revert?: string;
}

export function blocking(reasons: Reason[]): Reason[] {
  return reasons.filter((reason) => reason.severity === "block");
}
