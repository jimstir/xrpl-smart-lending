import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import fs from "fs";
import path from "path";

/**
 * Loan Service Memberships
 *
 * A borrower "joins" a loan service (LendingVault) when they first deposit
 * collateral / borrow against it, or explicitly join it by address. Memberships
 * are persisted per wallet so joined services reappear on every login.
 *
 * GET  /api/memberships?account=0x...   -> { success, vaultAddresses: string[] }
 * POST /api/memberships { account, vaultAddress, role? }
 */

const baseDir = process.cwd().endsWith("frontend") ? process.cwd() : path.join(process.cwd(), "frontend");
const membershipsFilePath = path.join(baseDir, "data", "memberships.json");
const loansFilePath = path.join(baseDir, "data", "loans.json");

interface MembershipRecord {
  id: string;
  account: string;
  vaultAddress: string;
  role: string;
  createdAt: string;
  updatedAt: string;
}

function readJson<T>(filePath: string): T[] {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch (err) {
    console.warn(`Could not read ${path.basename(filePath)}:`, err);
  }
  return [];
}

function writeLocalMemberships(records: MembershipRecord[]) {
  try {
    const dir = path.dirname(membershipsFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(membershipsFilePath, JSON.stringify(records, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not write local memberships.json:", err);
  }
}

/** Case-insensitive de-duplication that keeps the first-seen casing. */
function uniqueAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of addresses) {
    if (!a) continue;
    const key = a.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(a);
    }
  }
  return out;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const account = searchParams.get("account");

  if (!account) {
    return NextResponse.json({ success: false, error: "Missing account" }, { status: 400 });
  }

  const collected: string[] = [];

  // 1. Explicit memberships (Prisma first, then local file)
  let prismaOk = false;
  try {
    const rows = await prisma.serviceMembership.findMany({
      where: { account: { equals: account, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
    });
    collected.push(...rows.map((r) => r.vaultAddress));
    prismaOk = true;
  } catch (err: any) {
    console.warn("Prisma membership query error, using local fallback:", err.message);
  }

  const local = readJson<MembershipRecord>(membershipsFilePath).filter(
    (m) => m.account.toLowerCase() === account.toLowerCase()
  );
  collected.push(...local.map((m) => m.vaultAddress));

  // 2. Implicit memberships: any service the account already holds loans in
  try {
    if (prismaOk) {
      const loans = await prisma.loan.findMany({
        where: { borrower: { equals: account, mode: "insensitive" } },
        select: { vaultAddress: true },
      });
      collected.push(...loans.map((l) => l.vaultAddress));
    }
  } catch {}
  const localLoans = readJson<any>(loansFilePath).filter(
    (l) => l.borrower?.toLowerCase() === account.toLowerCase()
  );
  collected.push(...localLoans.map((l) => l.vaultAddress));

  return NextResponse.json({ success: true, vaultAddresses: uniqueAddresses(collected) });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { account, vaultAddress, role } = body;

    if (!account || !vaultAddress) {
      return NextResponse.json(
        { success: false, error: "Missing account or vaultAddress" },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const records = readJson<MembershipRecord>(membershipsFilePath);
    let record = records.find(
      (m) =>
        m.account.toLowerCase() === account.toLowerCase() &&
        m.vaultAddress.toLowerCase() === vaultAddress.toLowerCase()
    );
    const created = !record;
    if (!record) {
      record = {
        id: "membership-" + Date.now().toString(36),
        account,
        vaultAddress,
        role: role || "BORROWER",
        createdAt: now,
        updatedAt: now,
      };
      records.unshift(record);
      writeLocalMemberships(records);
    }

    try {
      await prisma.serviceMembership.upsert({
        where: { account_vaultAddress: { account, vaultAddress } },
        update: {},
        create: { account, vaultAddress, role: role || "BORROWER" },
      });
    } catch (prismaErr: any) {
      console.warn("Prisma membership upsert fallback to local storage:", prismaErr.message);
    }

    return NextResponse.json({ success: true, created, membership: record });
  } catch (err: any) {
    console.error("Membership create error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
