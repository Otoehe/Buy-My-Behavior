import { ethers } from 'ethers';
import { ensureAllowanceAndBalance, USDT_BSC } from './erc20';
import { ESCROW_ADDRESS, getSigner, generateScenarioIdBytes32 } from './escrowContract';

const escrowAbi = [
  'function lockFunds(bytes32 scenarioId,address token,address referrer,uint256 amount,uint256 deadline)'
];

/**
 * BSC-only: спочатку ensureAllowanceAndBalance(USDT BEP-20), далі lockFunds().
 */
export async function lockFundsWithChecks(args: {
  scenarioId: string;            // ваш рядковий id → буде bytes32
  amountUSDT: string;            // сума в USDT ("0.5")
  referrer?: string;             // 0x0 якщо нема
  token?: string;                // default USDT_BSC
  escrow?: string;               // default ESCROW_ADDRESS
  deadline: number;              // unix seconds
}) {
  const signer = await getSigner();
  const me = await signer.getAddress();

  const token = args.token ?? USDT_BSC;
  const escrow = args.escrow ?? ESCROW_ADDRESS;

  // Перевірка балансу + auto-approve рівно на потрібну суму
  const { amount } = await ensureAllowanceAndBalance({
    token,
    owner: me,
    spender: escrow,
    humanAmount: args.amountUSDT,
    provider: signer,
  });

  const escrowC = new ethers.Contract(escrow, escrowAbi, signer);
  const sid = generateScenarioIdBytes32(args.scenarioId);
  const callArgs = [sid, token, (args.referrer ?? ethers.constants.AddressZero), amount, ethers.BigNumber.from(args.deadline)];

  // Estimate gas із запасом
  let gas;
  try { gas = await escrowC.estimateGas.lockFunds(...callArgs); }
  catch { gas = ethers.BigNumber.from(600_000); }

  const tx = await escrowC.lockFunds(...callArgs, { gasLimit: gas.mul(12).div(10) });
  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}
