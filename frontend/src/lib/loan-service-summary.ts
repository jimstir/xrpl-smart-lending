import { ethers } from "ethers";
import { DEPLOYED_ADDRESSES, LENDING_VAULT_ABI } from "./contracts";

/**
 * Per-loan-service snapshot rendered by the LoanServiceCard grid.
 * On-chain fields are null when the read failed (card shows "—").
 */
export interface LoanServiceSummary {
  address: string;
  name: string;
  symbol: string;
  assetSymbol: string;
  owner: string;
  initialDeposit: string;
  createdAt?: string;
  // On-chain
  utilization: number | null;
  borrowApr: number | null;
  totalAssets: number | null;
  myDebt: number | null;
  // DB aggregates (all borrowers)
  activeLoans: number;
  totalActiveDebt: number;
  // DB aggregates (connected wallet only)
  myActiveLoans: number;
  myPrincipal: number;
  status: "LIVE" | "UNREACHABLE";
}

export interface LoanGroup {
  activeLoans: number;
  totalActiveDebt: number;
  totalLoans: number;
}

let readProvider: ethers.JsonRpcProvider | null = null;
/** Read-only provider (no MetaMask prompts) for batched card metrics. */
function getReadProvider(): ethers.JsonRpcProvider {
  if (!readProvider) readProvider = new ethers.JsonRpcProvider(DEPLOYED_ADDRESSES.rpcUrl);
  return readProvider;
}

const withTimeout = <T,>(p: Promise<T>, ms = 8000): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * Builds summaries for many vaults in parallel. A failing vault never blocks
 * the others — it is returned with status "UNREACHABLE" and null metrics.
 */
export async function fetchLoanServiceSummaries(
  vaults: any[],
  loanGroups: Record<string, LoanGroup>,
  myLoans: any[],
  account?: string
): Promise<LoanServiceSummary[]> {
  const provider = getReadProvider();

  const results = await Promise.allSettled(
    vaults.map(async (v): Promise<LoanServiceSummary> => {
      const key = v.address.toLowerCase();
      const group = loanGroups[key] || { activeLoans: 0, totalActiveDebt: 0, totalLoans: 0 };
      const mine = myLoans.filter(
        (l) => l.vaultAddress?.toLowerCase() === key && l.status === "ACTIVE"
      );

      const base: LoanServiceSummary = {
        address: v.address,
        name: v.name || "Lending Vault",
        symbol: v.symbol || "VAULT",
        assetSymbol: v.assetSymbol || "RLUSD",
        owner: v.owner || "",
        initialDeposit: v.initialDeposit || "0",
        createdAt: v.createdAt,
        utilization: null,
        borrowApr: null,
        totalAssets: null,
        myDebt: null,
        activeLoans: group.activeLoans,
        totalActiveDebt: group.totalActiveDebt,
        myActiveLoans: mine.length,
        myPrincipal: mine.reduce((s, l) => s + (parseFloat(l.amountRLUSD || "0") || 0), 0),
        status: "UNREACHABLE",
      };

      const c = new ethers.Contract(v.address, LENDING_VAULT_ABI, provider);
      const [util, rate, assets, debt] = await Promise.allSettled([
        withTimeout(c.getUtilizationRate()),
        withTimeout(c.getBorrowRate()),
        withTimeout(c.totalAssets()),
        account ? withTimeout(c.getBorrowerDebt(account)) : Promise.reject(new Error("no account")),
      ]);

      if (util.status === "fulfilled") base.utilization = Number(util.value) / 100;
      if (rate.status === "fulfilled") base.borrowApr = Number(rate.value) / 100;
      if (assets.status === "fulfilled") base.totalAssets = Number(ethers.formatEther(assets.value as bigint));
      if (debt.status === "fulfilled") base.myDebt = Number(ethers.formatEther((debt.value as any)[1]));
      if (util.status === "fulfilled" || rate.status === "fulfilled") base.status = "LIVE";

      return base;
    })
  );

  return results
    .filter((r): r is PromiseFulfilledResult<LoanServiceSummary> => r.status === "fulfilled")
    .map((r) => r.value);
}
