// Checks that every label CompanyNameRules.checkLabel accepts is already ENSIP-15-normal, so a client that normalizes
// per ENSIP-15 (viem's normalize here) reaches the issued name exactly as issued. It generates random labels by the
// same rule (1 to 32 of [a-z0-9], single inner hyphens, no run of 13 digits), adds the demo labels, and prints one
// JSON line.
// Run it like check-viem.mjs: (cd apps/landing && node --input-type=module) < contracts/script/ens/check-labels-viem.mjs
// Env: SAMPLES (default 5000).
import { normalize } from 'viem/ens'

const ALPHANUMERIC = 'abcdefghijklmnopqrstuvwxyz0123456789'
const pick = (s) => s[Math.floor(Math.random() * s.length)]

// A label by the contract's rule: no hyphen at either end or next to another, and no 13 digits in a row.
function randomLabel() {
  const length = 1 + Math.floor(Math.random() * 32)
  let label = ''
  while (label.length < length) {
    const hyphenOk = label.length > 0 && label.length < length - 1 && !label.endsWith('-')
    label += hyphenOk && Math.random() < 0.15 ? '-' : pick(ALPHANUMERIC)
  }
  return /[0-9]{13}/.test(label) ? randomLabel() : label
}

const demo = ['ap', 'keiri', 'zeirishi', 't2011', 'audit-2026-09', 'a-b-c', '0', 'x1']
const samples = Number(process.env.SAMPLES || 5000)
const labels = [...demo, ...Array.from({ length: samples }, randomLabel)]
const failures = labels.filter((label) => {
  try {
    return normalize(`${label}.t2011001234567.payee.eth`) !== `${label}.t2011001234567.payee.eth`
  } catch {
    return true
  }
})
process.stdout.write(`${JSON.stringify({ checked: labels.length, failures: failures.slice(0, 10) })}\n`)
if (failures.length) process.exit(1)
