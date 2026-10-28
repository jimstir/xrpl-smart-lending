import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import fs from "fs";
import path from "path";

const baseDir = process.cwd().endsWith("frontend") ? process.cwd() : path.join(process.cwd(), "frontend");
const dataFilePath = path.join(baseDir, "data", "vaults.json");

function readLocalVaults(): any[] {
  try {
    if (fs.existsSync(dataFilePath)) {
      const content = fs.readFileSync(dataFilePath, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Could not read local vaults.json:", err);
  }
  return [];
}

function writeLocalVaults(vaults: any[]) {
  try {
    const dir = path.dirname(dataFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dataFilePath, JSON.stringify(vaults, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not write local vaults.json:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Optional: only return loan services operated (deployed) by this address
  const owner = searchParams.get("owner");
  const matchesOwner = (v: any) =>
    !owner || (v.owner && v.owner.toLowerCase() === owner.toLowerCase());

  try {
    const vaults = await prisma.vault.findMany({
      orderBy: { createdAt: "desc" },
    });
    if (vaults && vaults.length > 0) {
      writeLocalVaults(vaults);
      return NextResponse.json({ success: true, vaults: vaults.filter(matchesOwner) });
    }
  } catch (err: any) {
    console.warn("Prisma vault query error, using local file fallback:", err.message);
  }

  // Fallback to persistent local data/vaults.json
  const localVaults = readLocalVaults();
  return NextResponse.json({ success: true, vaults: localVaults.filter(matchesOwner) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      name,
      symbol,
      address,
      reserveVault,
      riskEngine,
      liquidationManager,
      owner,
      asset,
      assetSymbol,
      initialDeposit,
      network,
    } = body;

    if (!address || !owner || !asset) {
      return NextResponse.json(
        { success: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }

    const vaultRecord = {
      id: "vault-" + address.toLowerCase(),
      name: name || "AI-Managed RLUSD Vault",
      symbol: symbol || "amRLUSD",
      address,
      reserveVault: reserveVault || "",
      riskEngine: riskEngine || "",
      liquidationManager: liquidationManager || "",
      owner,
      asset,
      assetSymbol: assetSymbol || "RLUSD",
      initialDeposit: initialDeposit || "0",
      network: network || "XRPL EVM Sidechain Testnet",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to local file storage immediately
    const existingVaults = readLocalVaults();
    const filtered = existingVaults.filter(
      (v) => v.address.toLowerCase() !== address.toLowerCase()
    );
    filtered.unshift(vaultRecord);
    writeLocalVaults(filtered);

    // Also attempt PostgreSQL / Prisma persistence if running
    try {
      await prisma.vault.upsert({
        where: { address },
        update: {
          name: name || "AI-Managed RLUSD Vault",
          symbol: symbol || "amRLUSD",
          reserveVault: reserveVault || "",
          riskEngine: riskEngine || "",
          liquidationManager: liquidationManager || "",
          owner,
          asset,
          assetSymbol: assetSymbol || "RLUSD",
          initialDeposit: initialDeposit || "0",
          network: network || "XRPL EVM Sidechain Testnet",
        },
        create: {
          name: name || "AI-Managed RLUSD Vault",
          symbol: symbol || "amRLUSD",
          address,
          reserveVault: reserveVault || "",
          riskEngine: riskEngine || "",
          liquidationManager: liquidationManager || "",
          owner,
          asset,
          assetSymbol: assetSymbol || "RLUSD",
          initialDeposit: initialDeposit || "0",
          network: network || "XRPL EVM Sidechain Testnet",
        },
      });
    } catch (prismaErr: any) {
      console.warn("Prisma upsert fallback to local storage:", prismaErr.message);
    }

    return NextResponse.json({ success: true, vault: vaultRecord });
  } catch (err: any) {
    console.error("Vault create error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
