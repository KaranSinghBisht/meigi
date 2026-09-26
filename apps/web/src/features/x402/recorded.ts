// One real research-agent run on Sepolia, replayed on the hosted site: 2 GPU-minutes, a dataset slice and a
// clean undeclared scrape all settled after screening; a compromised GPU mirror and a flagged undeclared
// scrape were both refused before signing.

import type { ScenarioResult } from '../../lib/api/merchant'

export const RECORDED_AT = new Date('2026-09-26T05:31:21.968Z')

const MINATO = { tNumber: 'T6999900000003', ens: 't6999900000003.payee.eth' } as const
const MINATO_PAYOUT = '0x4d6D5528f4a4c9E404130Fab23F5FA5DDcaffD30'
const FUJI = { tNumber: 'T8999900000001', ens: 't8999900000001.payee.eth' } as const
const FUJI_PAYOUT = '0x0C1d13e3CC82f3a6e0694D3EDe031595Ce32578D'
const SCAMMER_PAYOUT = '0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b'
const RONIN_EXPLOITER = '0x098B716B8Aaf21512996dC57EB0615e2383E2f96'

export const RECORDED_RUN: ScenarioResult = {
  startedAt: RECORDED_AT.toISOString(),
  settledCount: 4,
  refusedCount: 2,
  spentAtomic: '60000000000000000000',
  steps: [
    {
      label: 'GPU-minute 1 of 2, from Minato GPU Cloud',
      method: 'POST',
      path: '/compute/minato/gpu-minute',
      amountAtomic: '15000000000000000000',
      declared: MINATO,
      resolvedEns: MINATO_PAYOUT,
      registryPayout: MINATO_PAYOUT,
      payTo: MINATO_PAYOUT,
      screening: { flagged: false, summary: 'toxicScore 0' },
      outcome: 'settled',
      reason: null,
      txHash: '0x5dc4ca9b5c23129e7570c3cd420e64cd4fcd7f616bb9622c02dfb6b1bdf1c1ba',
    },
    {
      label: 'GPU-minute 2 of 2, from Minato GPU Cloud',
      method: 'POST',
      path: '/compute/minato/gpu-minute',
      amountAtomic: '15000000000000000000',
      declared: MINATO,
      resolvedEns: MINATO_PAYOUT,
      registryPayout: MINATO_PAYOUT,
      payTo: MINATO_PAYOUT,
      screening: { flagged: false, summary: 'toxicScore 0' },
      outcome: 'settled',
      reason: null,
      txHash: '0xcb42b1e8073ff3e2c5dc019b99c8647c4154cfe5afe64a6907714d5880aa2c1a',
    },
    {
      label: 'A dataset slice from Fuji Data',
      method: 'GET',
      path: '/data/fuji/dataset/invoice-ocr-2026-09',
      amountAtomic: '20000000000000000000',
      declared: FUJI,
      resolvedEns: FUJI_PAYOUT,
      registryPayout: FUJI_PAYOUT,
      payTo: FUJI_PAYOUT,
      screening: { flagged: false, summary: 'toxicScore 0' },
      outcome: 'settled',
      reason: null,
      txHash: '0x51d8457b5f884798cb50339487c416e0f2de791afe85b06daa55f4fd3c92eec5',
    },
    {
      label: 'A cheaper-looking GPU inference mirror it also found',
      method: 'POST',
      path: '/compute/minato/inference/compromised',
      amountAtomic: '30000000000000000000',
      declared: MINATO,
      resolvedEns: MINATO_PAYOUT,
      registryPayout: MINATO_PAYOUT,
      payTo: SCAMMER_PAYOUT,
      screening: { flagged: false, summary: 'toxicScore 0' },
      outcome: 'refused',
      reason: `t6999900000003.payee.eth resolves to the registered payout ${MINATO_PAYOUT}, but payTo asks for ${SCAMMER_PAYOUT} instead`,
      txHash: null,
    },
    {
      label: 'A public web-scrape API with no Meigi record',
      method: 'GET',
      path: '/web/scrape/undeclared',
      amountAtomic: '10000000000000000000',
      declared: null,
      resolvedEns: null,
      registryPayout: null,
      payTo: FUJI_PAYOUT,
      screening: { flagged: false, summary: 'toxicScore 0' },
      outcome: 'settled',
      reason: null,
      txHash: '0x368ec7ca1c5f4b260199d9bb8b60541a1e1d901a03cdd89041388c5ff603860f',
    },
    {
      label: 'Another public web-scrape API, paying an address screening already flags',
      method: 'GET',
      path: '/web/scrape/undeclared-flagged',
      amountAtomic: '10000000000000000000',
      declared: null,
      resolvedEns: null,
      registryPayout: null,
      payTo: RONIN_EXPLOITER,
      screening: { flagged: true, summary: 'toxicScore 100: known_scammer, sanction_address, blacklist' },
      outcome: 'refused',
      reason: `screening flagged 0x098B…2f96: toxicScore 100: known_scammer, sanction_address, blacklist`,
      txHash: null,
    },
  ],
}
