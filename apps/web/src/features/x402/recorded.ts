// One real research-agent run on Sepolia, replayed on the hosted site: 2 GPU-minutes and a dataset slice
// settled, a compromised GPU mirror and an undeclared scrape were both refused before signing.

import type { ScenarioResult } from '../../lib/api/merchant'

export const RECORDED_AT = new Date('2026-09-26T03:46:40.101Z')

const MINATO = { tNumber: 'T6999900000003', ens: 't6999900000003.payee.eth' } as const
const MINATO_PAYOUT = '0x4d6D5528f4a4c9E404130Fab23F5FA5DDcaffD30'
const FUJI = { tNumber: 'T8999900000001', ens: 't8999900000001.payee.eth' } as const
const FUJI_PAYOUT = '0x0C1d13e3CC82f3a6e0694D3EDe031595Ce32578D'
const SCAMMER_PAYOUT = '0xdCa52b5FA181a3307eCa852935BD40e3E0096d5b'

export const RECORDED_RUN: ScenarioResult = {
  startedAt: RECORDED_AT.toISOString(),
  settledCount: 3,
  refusedCount: 2,
  spentAtomic: '50000000000000000000',
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
      screening: null,
      outcome: 'settled',
      reason: null,
      txHash: '0x24b128e8301d079fa0aa7717406cd968f6fe64c3b7f2d613b1dfc8d61103b3f1',
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
      screening: null,
      outcome: 'settled',
      reason: null,
      txHash: '0xce9c6cf82c02403711036b488c99cf80c6cab24731f4b60dcde5eea661572a34',
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
      screening: null,
      outcome: 'settled',
      reason: null,
      txHash: '0x48d3d33aa61cb3b9c2c2eb6e474fc99cf3260d5454505ab142f3375a0774e3d3',
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
      screening: null,
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
      screening: null,
      outcome: 'refused',
      reason: 'merchant declares no Meigi payee and no screening is configured',
      txHash: null,
    },
  ],
}
