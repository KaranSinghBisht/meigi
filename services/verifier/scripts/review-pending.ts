/**
 * Manual review of the public pending window (VERIFIER_PENDING_HOURS): registrations someone objected to wait here
 * until an operator releases them (the attester then submits them) or rejects them (they are closed for good).
 *
 * Usage, from services/verifier:
 *   tsx scripts/review-pending.ts                     list every listing, with the objections to held ones
 *   tsx scripts/review-pending.ts release <publicId>  let the attester submit it
 *   tsx scripts/review-pending.ts reject <publicId>   close it; its officers are free to claim again
 * VERIFIER_DB_PATH picks the database (default ../../data/verifier.sqlite, the one the running verifier uses).
 */
import { openStore } from "../src/store/db.js";

const store = openStore(process.env.VERIFIER_DB_PATH ?? "../../data/verifier.sqlite");
const [command = "list", publicId] = process.argv.slice(2);

if (command === "list") {
  for (const listing of store.pendingRegistrations()) {
    const when = new Date(listing.submitAfter * 1000).toISOString();
    process.stdout.write(`${listing.id}  T${listing.tNumber}  ${listing.legalName}  ${listing.domain}  ${listing.status}  after ${when}\n`);
    for (const objection of store.objectionsFor(listing.id)) {
      const contact = objection.contact ? ` (contact: ${objection.contact})` : "";
      process.stdout.write(`    objection: ${objection.reason}${contact}\n`);
    }
  }
} else if ((command === "release" || command === "reject") && publicId) {
  if (!store.reviewPending(publicId, command)) {
    process.stderr.write(`no held registration under ${publicId}\n`);
    process.exit(1);
  }
  process.stdout.write(`${command === "release" ? "released" : "rejected"} ${publicId}\n`);
} else {
  process.stderr.write("usage: tsx scripts/review-pending.ts [list | release <publicId> | reject <publicId>]\n");
  process.exit(2);
}
