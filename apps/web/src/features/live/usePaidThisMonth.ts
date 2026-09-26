import { agentVaultAbi } from '@meigi/abi'
import { useEffect, useState } from 'react'
import { getAbiItem } from 'viem'
import { publicClient } from '../../lib/chain/client'
import { formatTokenAmount } from '../../lib/chain/format'
import { env } from '../../lib/env/env'

const invoicePaid = getAbiItem({ abi: agentVaultAbi, name: 'InvoicePaid' })

/** Public RPCs cap a log query's block range; the vault's history is short, so fixed chunks are enough. */
const CHUNK = 10_000n

/** JST has no daylight saving: the month starts at 00:00 UTC+9 on the 1st. */
const JST_MS = 9 * 3600_000

export interface PaidThisMonth {
  /** The total in the vault's token (mJPYC, where 1 mJPYC stands for ¥1), formatted like "56,000". */
  readonly amount: string
  readonly count: number
  /** The first instant of the month counted, in Japan. */
  readonly since: Date
}

function monthStartJst(now: Date): Date {
  const jst = new Date(now.getTime() + JST_MS)
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1) - JST_MS)
}

async function paidLogs() {
  const latest = await publicClient.getBlockNumber()
  const logs = []
  for (let from = env.registryFromBlock; from <= latest; from += CHUNK) {
    const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest
    const chunk = { address: env.vault, event: invoicePaid, fromBlock: from, toBlock: to, strict: true } as const
    logs.push(...(await publicClient.getLogs(chunk)))
  }
  return logs
}

/** Every InvoicePaid the vault emitted since the start of this month (JST), read from Sepolia. */
async function readPaidThisMonth(now: Date): Promise<PaidThisMonth> {
  const since = monthStartJst(now)
  const logs = await paidLogs()
  const blocks = [...new Set(logs.map((log) => log.blockNumber))]
  const times = new Map(
    await Promise.all(
      blocks.map(async (n) => [n, (await publicClient.getBlock({ blockNumber: n })).timestamp] as const),
    ),
  )
  const recent = logs.filter((log) => Number(times.get(log.blockNumber) ?? 0n) * 1000 >= since.getTime())
  const total = recent.reduce((sum, log) => sum + log.args.amount, 0n)
  return { amount: formatTokenAmount(total), count: recent.length, since }
}

/**
 * What the AP agent's vault paid this month, live from its InvoicePaid events (works on the hosted site: it needs
 * only the public RPC). Null while loading or when the chain can't be read: hide the figure, never guess it.
 */
export function usePaidThisMonth(): PaidThisMonth | null {
  const [paid, setPaid] = useState<PaidThisMonth | null>(null)
  useEffect(() => {
    let live = true
    readPaidThisMonth(new Date()).then(
      (next) => live && setPaid(next),
      (error: unknown) => {
        reportError(error)
        if (live) setPaid(null)
      },
    )
    return () => {
      live = false
    }
  }, [])
  return paid
}
