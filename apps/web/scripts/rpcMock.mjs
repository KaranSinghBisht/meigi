// Screenshot-only helper: rewrites the registry's payeeOf answers on their way from the RPC to the page,
// so the UI can be captured with a queued payout change. The live chain has none, and the app never fakes it.

import {
  decodeFunctionData,
  decodeFunctionResult,
  encodeFunctionResult,
  multicall3Abi,
  parseAbi,
  toFunctionSelector,
} from 'viem'

const registryAbi = parseAbi([
  'struct PayeeView { string legalName; address controller; address payout; address pending; uint64 effectiveAt; address nextController; uint64 controllerEffectiveAt; uint64 nonce; uint8 threshold; uint8 status; bytes32 evidence; }',
  'function payeeOf(uint64 tNumber) view returns (PayeeView)',
])
const PAYEE_OF = toFunctionSelector('function payeeOf(uint64)')
const MULTICALL3 = '0xca11bde05977b3631167028862be2a173976ca11'

function withPending(returnData, pending, effectiveAt) {
  const view = decodeFunctionResult({ abi: registryAbi, functionName: 'payeeOf', data: returnData })
  return encodeFunctionResult({
    abi: registryAbi,
    functionName: 'payeeOf',
    result: { ...view, pending, effectiveAt },
  })
}

function patchAggregate(call, result, registry, pending, effectiveAt) {
  const { args } = decodeFunctionData({ abi: multicall3Abi, data: call.data })
  const calls = args[0]
  const results = decodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', data: result })
  const patched = results.map((item, index) => {
    const target = calls[index]
    const isPayeeOf = target.target.toLowerCase() === registry && target.callData.startsWith(PAYEE_OF)
    return isPayeeOf && item.success
      ? { ...item, returnData: withPending(item.returnData, pending, effectiveAt) }
      : item
  })
  return encodeFunctionResult({ abi: multicall3Abi, functionName: 'aggregate3', result: patched })
}

function patchResult(body, json, options) {
  if (body?.method !== 'eth_call' || typeof json?.result !== 'string') return json
  const call = body.params?.[0] ?? {}
  const to = String(call.to ?? '').toLowerCase()
  const registry = options.registry.toLowerCase()
  if (to === registry && String(call.data).startsWith(PAYEE_OF)) {
    return { ...json, result: withPending(json.result, options.pending, options.effectiveAt) }
  }
  if (to === MULTICALL3) {
    return { ...json, result: patchAggregate(call, json.result, registry, options.pending, options.effectiveAt) }
  }
  return json
}

/** Every payeeOf read through `rpcUrl` reports a payout change to `pending`, landing in `landsInSeconds`. */
export async function mockPendingPayout(page, { rpcUrl, registry, pending, landsInSeconds }) {
  const effectiveAt = BigInt(Math.floor(Date.now() / 1000) + landsInSeconds)
  const options = { registry, pending, effectiveAt }
  await page.route(rpcUrl, async (route) => {
    const body = route.request().postDataJSON()
    const response = await route.fetch()
    const json = await response.json()
    const patched = Array.isArray(body)
      ? json.map((item) =>
          patchResult(
            body.find((request) => request.id === item.id),
            item,
            options,
          ),
        )
      : patchResult(body, json, options)
    await route.fulfill({ response, json: patched })
  })
}
