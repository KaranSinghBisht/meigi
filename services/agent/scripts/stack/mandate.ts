import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { agentVaultAbi, mandateGateAbi, payeeRegistryAbi } from "@meigi/abi";
import { createPublicClient, createWalletClient, getAddress, http, keccak256, pad, toBytes, type Abi, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { LocalStack } from "./stack.js";

/**
 * The buyer company's ENS mandate on the local chain, as contracts/test/payments/MandateGate.t.sol sets it up:
 * 株式会社ハルカ製作所 (T4999900000005, fictional) is registered, opens its CompanyNamespace (ENSv2 stand-ins from
 * EnsV2Mocks), and issues `ap` to the agent key. The MandateGate becomes the vault's agent. Needs the forge build in
 * contracts/out (the stack's deploy runs it).
 */

export const PRINCIPAL = 4999900000005n;
const CLAIM = "t4999900000005";
const LABEL = "ap";
const PARENT: Hex = "0x0570617965650365746800"; // payee.eth, DNS-encoded
const OUT = fileURLToPath(new URL("../../../../contracts/out/", import.meta.url));

function artifact(file: string, name: string): { abi: Abi; bytecode: Hex } {
  const json = JSON.parse(readFileSync(`${OUT}${file}/${name}.json`, "utf8")) as { abi: Abi; bytecode: { object: Hex } };
  return { abi: json.abi, bytecode: json.bytecode.object };
}

export interface MandateWorld {
  gate: Address;
  names: Address;
  name: string; // ap.t4999900000005.payee.eth
  revoke(): Promise<void>;
  issue(): Promise<void>;
}

export async function deployMandate(stack: LocalStack): Promise<MandateWorld> {
  const transport = http(stack.anvil.url);
  const reader = createPublicClient({ chain: foundry, transport });
  const wallet = (key: Hex) => createWalletClient({ chain: foundry, transport, account: privateKeyToAccount(key) });
  const [deployer, attester, company, owner] = [stack.accounts.deployer, stack.accounts.attester, stack.accounts.controller, stack.accounts.vaultOwner].map((a) => wallet(a.key));
  const confirm = async (hash: Hex) => {
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`mandate setup transaction ${hash} reverted`);
    return receipt;
  };
  const deploy = async (file: string, name: string, args: unknown[] = []) => {
    const { abi, bytecode } = artifact(file, name);
    const receipt = await confirm(await deployer!.deployContract({ abi, bytecode, args }));
    return { address: getAddress(receipt.contractAddress as Address), abi };
  };

  // The buyer company, registered like any payee; its business key is the stack's controller.
  const registration = {
    tNumber: PRINCIPAL,
    legalName: "株式会社ハルカ製作所",
    controller: stack.accounts.controller.address,
    payout: "0x000000000000000000000000000000000000dEaD" as Address,
    officers: [pad("0xa1", { size: 32 })],
    threshold: 1,
    evidence: keccak256(toBytes("demo-fixture:fictional-buyer")),
  };
  await confirm(await attester!.writeContract({ address: stack.deployment.registry, abi: payeeRegistryAbi, functionName: "register", args: [registration] }));

  const factory = await deploy("EnsV2Mocks.sol", "MockEnsFactory");
  const claims = await deploy("EnsV2Mocks.sol", "MockClaims");
  const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 86_400);
  await confirm(await deployer!.writeContract({ address: claims.address, abi: claims.abi, functionName: "setExpiry", args: [CLAIM, expiry] }));
  const [registryImpl, resolverImpl] = await Promise.all(
    ["registryImplementation", "resolverImplementation"].map((fn) => reader.readContract({ address: factory.address, abi: factory.abi, functionName: fn }) as Promise<Address>),
  );
  const brake = stack.accounts.deployer.address;
  const names = await deploy("CompanyNamespace.sol", "CompanyNamespace", [stack.deployment.registry, factory.address, registryImpl, resolverImpl, claims.address, brake, PARENT]);
  await confirm(await company!.writeContract({ address: names.address, abi: names.abi, functionName: "open", args: [PRINCIPAL] }));
  const namespace = (await reader.readContract({ address: names.address, abi: names.abi, functionName: "namespaceOf", args: [PRINCIPAL] })) as Address;
  await confirm(await deployer!.writeContract({ address: claims.address, abi: claims.abi, functionName: "setSubregistry", args: [CLAIM, namespace] }));

  const mandateName = { label: LABEL, holder: stack.accounts.agent.address, expiry, keys: ["description"], values: ["AP agent of 株式会社ハルカ製作所 (fictional demo company)"] };
  const issue = async () => void (await confirm(await company!.writeContract({ address: names.address, abi: names.abi, functionName: "issue", args: [PRINCIPAL, mandateName] })));
  const revoke = async () => void (await confirm(await company!.writeContract({ address: names.address, abi: names.abi, functionName: "revoke", args: [PRINCIPAL, LABEL] })));
  await issue();

  const gate = await deploy("MandateGate.sol", "MandateGate", [stack.deployment.vault, names.address, PRINCIPAL, LABEL]);
  await confirm(await owner!.writeContract({ address: stack.deployment.vault, abi: agentVaultAbi, functionName: "setAgent", args: [gate.address] }));
  const holder = await reader.readContract({ address: gate.address, abi: mandateGateAbi, functionName: "holder" });
  if (holder.toLowerCase() !== stack.accounts.agent.address.toLowerCase()) throw new Error(`the mandate names ${holder}, not the agent key`);
  return { gate: gate.address, names: names.address, name: `${LABEL}.${CLAIM}.payee.eth`, revoke, issue };
}
