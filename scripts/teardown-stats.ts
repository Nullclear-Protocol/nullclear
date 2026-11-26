/**
 * NullClear Polymarket Teardown Stats CLI
 *
 * Queries remote Cloudflare D1 `audited_whales` (or `--api` fallback) and prints a
 * publication-ready data teardown report:
 *  - How many top leaderboard wallets turn unprofitable after 2026 taker fees + 1.0¢ fill delay
 *  - Average Copy-Tax drag & flip rate by category
 *  - Copyability Grade (A-F) distribution
 *  - Top 10 highest-grade (A/B) copyable wallets with live nullclear.com/whale/<addr> URLs
 *  - Top 5 biggest Copy-Tax traps (headline profit -> negative Net Copier PnL)
 *
 * Usage:
 *   npx tsx scripts/teardown-stats.ts           # Queries remote D1 `nullclear-db` via wrangler
 *   npx tsx scripts/teardown-stats.ts --local   # Queries local D1
 *   npx tsx scripts/teardown-stats.ts --api     # Queries https://nullclear.com/api/poly/leaderboard?limit=200
 */

import { execSync } from "node:child_process";

interface AuditedWhaleRow {
  address: string;
  display_name: string;
  copyability_grade: string;
  copyability_score: number;
  naive_pnl_usd: number;
  net_copier_pnl_usd: number;
  maker_pnl_usd: number;
  total_volume_usd: number;
  drag_pct: number;
  primary_category: string;
  trade_count: number;
}

function fmtUsd(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}

function queryD1Rows(remote: boolean): AuditedWhaleRow[] {
  const sql =
    "SELECT address, display_name, copyability_grade, copyability_score, naive_pnl_usd, net_copier_pnl_usd, maker_pnl_usd, total_volume_usd, drag_pct, primary_category, trade_count FROM audited_whales ORDER BY naive_pnl_usd DESC LIMIT 200;";
  const flag = remote ? "--remote" : "--local";
  const cmd = `pnpm --filter @nullclear/worker-arbiter exec wrangler d1 execute nullclear-db ${flag} --json --command "${sql}"`;
  const raw = execSync(cmd, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  // Extract JSON array from wrangler stdout (wrangler may emit a banner before JSON)
  const jsonStart = raw.indexOf("[");
  if (jsonStart === -1) {
    throw new Error(`Unexpected wrangler output:\n${raw}`);
  }
  const parsed = JSON.parse(raw.slice(jsonStart));
  const results = parsed?.[0]?.results;
  if (!Array.isArray(results)) {
    throw new Error("No results array returned from D1 query.");
  }
  return results as AuditedWhaleRow[];
}

async function queryApiRows(): Promise<AuditedWhaleRow[]> {
  const res = await fetch("https://nullclear.com/api/poly/leaderboard?limit=200");
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = (await res.json()) as any;
  return (data.whales || []).map((w: any) => ({
    address: w.address,
    display_name: w.displayName,
    copyability_grade: w.copyabilityGrade,
    copyability_score: Number(w.copyabilityScore || 0),
    naive_pnl_usd: Number(w.naivePnlUsd || 0),
    net_copier_pnl_usd: Number(w.netCopierPnlUsd || 0),
    maker_pnl_usd: Number(w.makerPnlUsd || 0),
    total_volume_usd: Number(w.totalVolumeUsd || 0),
    drag_pct: Number(w.dragPct || 0),
    primary_category: w.primaryCategory || "other",
    trade_count: Number(w.tradeCount || 0)
  }));
}

async function main() {
  const useApi = process.argv.includes("--api");
  const useLocal = process.argv.includes("--local");

  const rows = useApi ? await queryApiRows() : queryD1Rows(!useLocal);

  if (rows.length === 0) {
    console.log("No rows found in audited_whales.");
    return;
  }

  // Focus headline cohort on top 100 by reported/naive PnL
  const top100 = [...rows].sort((a, b) => b.naive_pnl_usd - a.naive_pnl_usd).slice(0, 100);
  const profitableReported = top100.filter((w) => w.naive_pnl_usd > 0);
  const flippedUnprofitable = profitableReported.filter((w) => w.net_copier_pnl_usd <= 0);
  const profitableAsTaker = profitableReported.filter((w) => w.net_copier_pnl_usd > 0);
  const profitableAsMaker = profitableReported.filter((w) => w.maker_pnl_usd > 0);
  const avgDragAll =
    top100.reduce((s, w) => s + Number(w.drag_pct || 0), 0) / Math.max(1, top100.length);

  console.log("\n======================================================================");
  console.log("  NULLCLEAR 2026 POLYMARKET COPY-TAX TEARDOWN (REMOTE D1 REPORT)");
  console.log("======================================================================");
  console.log(`Total Audited Wallets in D1:          ${rows.length}`);
  console.log(`Top Leaderboard Cohort Analyzed:      ${top100.length}`);
  console.log(`Positive Headline PnL Wallets:        ${profitableReported.length}`);
  console.log(
    `Flipped UNPROFITABLE (Fees + 1¢):     ${flippedUnprofitable.length} / ${profitableReported.length} (${(
      (flippedUnprofitable.length / Math.max(1, profitableReported.length)) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `Still Profitable as Taker Copier:     ${profitableAsTaker.length} / ${profitableReported.length} (${(
      (profitableAsTaker.length / Math.max(1, profitableReported.length)) *
      100
    ).toFixed(1)}%)`
  );
  console.log(
    `Profitable via postOnly Maker (0%):   ${profitableAsMaker.length} / ${profitableReported.length}`
  );
  console.log(`Average 1.0¢ Copy-Tax Drag:           ${avgDragAll.toFixed(2)}% of volume`);

  // Grade distribution
  const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  for (const w of top100) {
    gradeCounts[w.copyability_grade] = (gradeCounts[w.copyability_grade] || 0) + 1;
  }
  console.log(
    `Copyability Grades (Top ${top100.length}):        A=${gradeCounts.A} | B=${gradeCounts.B} | C=${gradeCounts.C} | D=${gradeCounts.D} | F=${gradeCounts.F}`
  );

  // Category Breakdown
  const catStats = new Map<
    string,
    { count: number; dragSum: number; flipped: number; profitable: number }
  >();
  for (const w of top100) {
    const c = w.primary_category || "other";
    const cur = catStats.get(c) || { count: 0, dragSum: 0, flipped: 0, profitable: 0 };
    cur.count += 1;
    cur.dragSum += Number(w.drag_pct || 0);
    if (w.naive_pnl_usd > 0) {
      cur.profitable += 1;
      if (w.net_copier_pnl_usd <= 0) cur.flipped += 1;
    }
    catStats.set(c, cur);
  }

  console.log("\n--- AVERAGE COPY-TAX DRAG BY CATEGORY ---");
  console.table(
    Array.from(catStats.entries())
      .map(([category, s]) => ({
        Category: category,
        Wallets: s.count,
        "Avg Drag %": `${(s.dragSum / Math.max(1, s.count)).toFixed(2)}%`,
        "Flipped Unprofitable": `${s.flipped}/${s.profitable} (${(
          (s.flipped / Math.max(1, s.profitable)) *
          100
        ).toFixed(0)}%)`
      }))
      .sort((a, b) => b.Wallets - a.Wallets)
  );

  // Top 10 Highest-Grade A/B Copyable Wallets
  const topCopyable = rows
    .filter((w) => (w.copyability_grade === "A" || w.copyability_grade === "B") && w.net_copier_pnl_usd > 0)
    .sort((a, b) => b.copyability_score - a.copyability_score || b.net_copier_pnl_usd - a.net_copier_pnl_usd)
    .slice(0, 10);

  console.log("\n--- TOP 10 HIGHEST-GRADE (A/B) COPYABLE WALLETS ---");
  console.table(
    topCopyable.map((w, idx) => ({
      "#": idx + 1,
      Name: w.display_name,
      Grade: `${w.copyability_grade} (${w.copyability_score})`,
      Category: w.primary_category,
      "Headline PnL": fmtUsd(w.naive_pnl_usd),
      "Net Copier (1¢)": fmtUsd(w.net_copier_pnl_usd),
      "Drag %": `${Number(w.drag_pct).toFixed(2)}%`,
      Audit: `https://nullclear.com/whale/${w.address}`
    }))
  );

  // Top 5 Biggest Copy-Tax Traps (positive headline PnL -> worst negative Net Copier PnL)
  const topTraps = rows
    .filter((w) => w.naive_pnl_usd > 0 && w.net_copier_pnl_usd < 0)
    .sort((a, b) => a.net_copier_pnl_usd - b.net_copier_pnl_usd)
    .slice(0, 5);

  if (topTraps.length > 0) {
    console.log("\n--- TOP 5 BIGGEST COPY-TAX TRAPS (HEADLINE PROFIT -> COPIER LOSS) ---");
    console.table(
      topTraps.map((w, idx) => ({
        "#": idx + 1,
        Name: w.display_name,
        Grade: `${w.copyability_grade} (${w.copyability_score})`,
        Category: w.primary_category,
        "Headline PnL": fmtUsd(w.naive_pnl_usd),
        "Net Copier (1¢)": fmtUsd(w.net_copier_pnl_usd),
        "Drag %": `${Number(w.drag_pct).toFixed(2)}%`,
        Audit: `https://nullclear.com/whale/${w.address}`
      }))
    );
  }
}

main().catch((err) => {
  console.error("Teardown stats failed:", err?.message || err);
  process.exit(1);
});
