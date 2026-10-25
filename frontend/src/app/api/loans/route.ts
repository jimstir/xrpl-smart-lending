import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import fs from "fs";
import path from "path";

const baseDir = process.cwd().endsWith("frontend") ? process.cwd() : path.join(process.cwd(), "frontend");
const dataFilePath = path.join(baseDir, "data", "loans.json");

function readLocalLoans(): any[] {
  try {
    if (fs.existsSync(dataFilePath)) {
      const content = fs.readFileSync(dataFilePath, "utf8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.warn("Could not read local loans.json:", err);
  }
  return [];
}

function writeLocalLoans(loans: any[]) {
  try {
    const dir = path.dirname(dataFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(dataFilePath, JSON.stringify(loans, null, 2), "utf8");
  } catch (err) {
    console.warn("Could not write local loans.json:", err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const borrower = searchParams.get("borrower");
  const vaultAddress = searchParams.get("vaultAddress");

  try {
    const where: any = {};
    if (borrower) {
      where.borrower = { equals: borrower, mode: "insensitive" };
    }
    if (vaultAddress) {
      where.vaultAddress = { equals: vaultAddress, mode: "insensitive" };
    }

    const loans = await prisma.loan.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: "desc" },
    });
    if (loans) {
      return NextResponse.json({ success: true, loans });
    }
  } catch (err: any) {
    console.warn("Prisma loan query error, using local fallback:", err.message);
  }

  // Fallback to local loans.json
  const localLoans = readLocalLoans();
  const filtered = localLoans.filter((l) => {
    let match = true;
    if (borrower && l.borrower.toLowerCase() !== borrower.toLowerCase()) match = false;
    if (vaultAddress && l.vaultAddress.toLowerCase() !== vaultAddress.toLowerCase()) match = false;
    return match;
  });
  return NextResponse.json({ success: true, loans: filtered });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      borrower,
      vaultAddress,
      amountRLUSD,
      collateralToken,
      collateralAmount,
      txHash,
    } = body;

    if (!borrower || !vaultAddress || !amountRLUSD) {
      return NextResponse.json(
        { success: false, error: "Missing required loan parameters" },
        { status: 400 }
      );
    }

    const loanRecord = {
      id: "loan-" + Date.now().toString(36),
      borrower,
      vaultAddress,
      amountRLUSD: String(amountRLUSD),
      collateralToken: collateralToken || "wETH",
      collateralAmount: String(collateralAmount || "0"),
      txHash: txHash || "",
      status: "ACTIVE",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Save to local file storage immediately
    const localLoans = readLocalLoans();
    localLoans.unshift(loanRecord);
    writeLocalLoans(localLoans);

    // Also attempt PostgreSQL / Prisma persistence if running
    try {
      await prisma.loan.create({
        data: {
          borrower,
          vaultAddress,
          amountRLUSD: String(amountRLUSD),
          collateralToken: collateralToken || "wETH",
          collateralAmount: String(collateralAmount || "0"),
          txHash: txHash || "",
          status: "ACTIVE",
        },
      });
    } catch (prismaErr: any) {
      console.warn("Prisma loan create fallback to local storage:", prismaErr.message);
    }

    return NextResponse.json({ success: true, loan: loanRecord });
  } catch (err: any) {
    console.error("Loan create error:", err);
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { success: false, error: "Missing loan id or status" },
        { status: 400 }
      );
    }

    // Update in local file storage
    const localLoans = readLocalLoans();
    let updatedLoan: any = null;
    for (const l of localLoans) {
      if (l.id === id) {
        l.status = status;
        l.updatedAt = new Date().toISOString();
        updatedLoan = l;
        break;
      }
    }
    writeLocalLoans(localLoans);

    // Also attempt Prisma
    try {
      await prisma.loan.update({
        where: { id },
        data: { status },
      });
    } catch (prismaErr) {}

    return NextResponse.json({ success: true, loan: updatedLoan || { id, status } });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
