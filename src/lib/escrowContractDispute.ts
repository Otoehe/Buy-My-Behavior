import { ethers } from 'ethers';
import { ESCROW_ADDRESS, getSigner, generateScenarioIdBytes32 } from './escrowContract';

const disputeAbi = [
  'function resolveDisputeToExecutor(bytes32)',
  'function resolveDisputeToExecutor(uint256)',
  'function resolveDisputeToExecutor()',

  'function resolveDisputeToCustomer(bytes32)',
  'function resolveDisputeToCustomer(uint256)',
  'function resolveDisputeToCustomer()',
];

type CommonArgs = { scenarioId?: string; escrow?: string };

async function runAny(
  escrow: any,
  fn: string,
  args: any[] = [],
  fallbackGas = 600_000
) {
  // пробуємо з estimateGas, якщо падає — виставляємо ручний gasLimit
  const est = await escrow.estimateGas[fn](...args).catch(() => null);
  return est
    ? escrow[fn](...args, { gasLimit: est.mul(12).div(10) })
    : escrow[fn](...args, { gasLimit: fallbackGas });
}

export async function resolveDisputeToExecutor({ scenarioId, escrow: addr }: CommonArgs) {
  const signer = await getSigner();
  const escrow = new ethers.Contract(addr ?? ESCROW_ADDRESS, disputeAbi, signer) as any;

  if (scenarioId) {
    const b32 = generateScenarioIdBytes32(scenarioId);
    try { return await (await runAny(escrow, 'resolveDisputeToExecutor(bytes32)', [b32])).wait(); } catch {}
    try { return await (await runAny(escrow, 'resolveDisputeToExecutor(uint256)', [ethers.BigNumber.from(b32)])).wait(); } catch {}
  }
  return await (await runAny(escrow, 'resolveDisputeToExecutor()')).wait();
}

export async function resolveDisputeToCustomer({ scenarioId, escrow: addr }: CommonArgs) {
  const signer = await getSigner();
  const escrow = new ethers.Contract(addr ?? ESCROW_ADDRESS, disputeAbi, signer) as any;

  if (scenarioId) {
    const b32 = generateScenarioIdBytes32(scenarioId);
    try { return await (await runAny(escrow, 'resolveDisputeToCustomer(bytes32)', [b32])).wait(); } catch {}
    try { return await (await runAny(escrow, 'resolveDisputeToCustomer(uint256)', [ethers.BigNumber.from(b32)])).wait(); } catch {}
  }
  return await (await runAny(escrow, 'resolveDisputeToCustomer()')).wait();
}
