#!/usr/bin/env node
/**
 * 試打「歷史收盤價」與「除權息／股利」資料來源，印出每個來源的回應摘要。
 * 研究文件：docs/research/history-and-dividend-sources.md
 *
 *   node scripts/probe-history-sources.mjs                # 全部來源，約 2 分鐘（證交所要放慢打）
 *   node scripts/probe-history-sources.mjs twse finmind   # 只跑指定來源
 *   node scripts/probe-history-sources.mjs --out /tmp/probe.json   # 另存完整結果
 *
 * 來源代號：twse、tpex、mops、finmind、yahoo、check（交叉比對收盤價與還原價，需要 twse + finmind + yahoo）
 * 不需要任何 API key；FinMind 若設了 FINMIND_TOKEN 環境變數會帶上（上限 300 → 600 次/小時）。
 *
 * 期間：今天往回一年。上市用 2330、0050；上櫃用 6488（環球晶）、00679B（元大美債20年）。
 * 每個請求都帶 Origin header，印出回應有沒有 Access-Control-Allow-Origin，用來判斷網頁版能不能直接打。
 */
import { writeFileSync } from "node:fs";

const argv = process.argv.slice(2);
const outIndex = argv.indexOf("--out");
const outPath = outIndex >= 0 ? argv[outIndex + 1] : null;
const picked = argv.filter((a, i) => !a.startsWith("--") && (outIndex < 0 || i !== outIndex + 1));
const ALL = ["twse", "tpex", "mops", "finmind", "yahoo", "check"];
const sources = picked.length > 0 ? picked : ALL;

const TWSE_SYMBOLS = ["2330", "0050"];
const TPEX_SYMBOLS = ["6488", "00679B"];
/** 證交所網站（www.twse.com.tw）連續打太快會被暫時擋 IP，每次間隔 2.5 秒 */
const TWSE_WWW_GAP_MS = 2500;

const today = new Date();
const oneYearAgo = new Date(today);
oneYearAgo.setFullYear(today.getFullYear() - 1);

const results = {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- 工具 ----------

const pad = (n) => String(n).padStart(2, "0");
const ymd = (d, sep = "") => `${d.getFullYear()}${sep}${pad(d.getMonth() + 1)}${sep}${pad(d.getDate())}`;
const iso = (d) => ymd(d, "-");

/** 從一年前那個月到這個月，每個月的 1 號 */
function monthStarts() {
  const list = [];
  const d = new Date(oneYearAgo.getFullYear(), oneYearAgo.getMonth(), 1);
  while (d <= today) {
    list.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return list;
}

/** 民國日期 → ISO：「114/10/01」「114年10月01日」「1141001」都吃 */
function rocToIso(text) {
  const s = String(text).trim();
  let m = s.match(/^(\d{2,3})[/年](\d{1,2})[/月](\d{1,2})/);
  if (!m) m = s.match(/^(\d{2,3})(\d{2})(\d{2})$/);
  if (!m) return null;
  return `${Number(m[1]) + 1911}-${pad(m[2])}-${pad(m[3])}`;
}

/** 「1,325.00」「--」「----」「」 → number 或 null */
function num(text) {
  const s = String(text ?? "").replace(/,/g, "").trim();
  if (s === "" || /^-+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function request(url, { method = "GET", body, headers = {} } = {}) {
  const started = Date.now();
  const response = await fetch(url, {
    method,
    body,
    headers: { "User-Agent": "Mozilla/5.0 (cspo research probe)", Origin: "https://example.com", ...headers },
    signal: AbortSignal.timeout(90_000),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // 不是 JSON（例如 MOPS 的安全性擋頁），留 text 給呼叫端看
  }
  return {
    status: response.status,
    ms: Date.now() - started,
    bytes: text.length,
    cors: response.headers.get("access-control-allow-origin"),
    json,
    text,
  };
}

function corsLabel(cors) {
  return cors ? `CORS: ${cors}` : "CORS: 無（瀏覽器擋，手機 app 可直接打）";
}

function summarizeCloses(rows) {
  if (rows.length === 0) return "0 筆";
  const first = rows[0];
  const last = rows.at(-1);
  return `${rows.length} 筆，${first.date} 收 ${first.close} → ${last.date} 收 ${last.close}`;
}

function section(title) {
  console.log(`\n=== ${title}`);
}

// ---------- 證交所（上市） ----------

async function probeTwse() {
  section("證交所 www：STOCK_DAY 個股月成交（一次一檔一個月）");
  const out = { closes: {}, exRights: [], upcoming: [], meta: {} };
  for (const symbol of TWSE_SYMBOLS) {
    const rows = [];
    let cors = null;
    let totalMs = 0;
    for (const month of monthStarts()) {
      const url = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ymd(month)}&stockNo=${symbol}&response=json`;
      const r = await request(url);
      cors = r.cors;
      totalMs += r.ms;
      if (r.json?.stat !== "OK") {
        console.log(`  ${symbol} ${ymd(month)}: ${r.json?.stat ?? `HTTP ${r.status}`}`);
      } else {
        // fields: 日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數, 註記
        for (const row of r.json.data) rows.push({ date: rocToIso(row[0]), close: num(row[6]) });
      }
      await sleep(TWSE_WWW_GAP_MS);
    }
    const inRange = rows.filter((r) => r.date >= iso(oneYearAgo) && r.close !== null);
    out.closes[symbol] = inRange;
    console.log(`  ${symbol}: ${summarizeCloses(inRange)}（${monthStarts().length} 個請求、共 ${totalMs} ms，${corsLabel(cors)}）`);
  }

  section("證交所 www：TWT49U 除權除息計算結果表（日期區間，全市場）");
  {
    const url = `https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=${ymd(oneYearAgo)}&endDate=${ymd(today)}&response=json`;
    const r = await request(url);
    console.log(`  HTTP ${r.status}，${r.ms} ms，${r.bytes} bytes，全市場 ${r.json?.data?.length ?? 0} 筆，${corsLabel(r.cors)}`);
    // fields: 資料日期, 股票代號, 股票名稱, 除權息前收盤價, 除權息參考價, 權值+息值, 權/息, …
    for (const row of r.json?.data ?? []) {
      const symbol = row[1].trim();
      if (!TWSE_SYMBOLS.includes(symbol)) continue;
      const item = {
        symbol,
        exDate: rocToIso(row[0]),
        closeBefore: num(row[3]),
        reference: num(row[4]),
        value: num(row[5]),
        kind: row[6],
      };
      out.exRights.push(item);
      console.log(`  ${symbol} ${item.exDate} ${item.kind} ${item.value}（前收 ${item.closeBefore} → 參考價 ${item.reference}）`);
    }
    await sleep(TWSE_WWW_GAP_MS);
  }

  section("證交所 www：TWT49UDetail 單一除權息事件明細（現金股利、每千股配股）");
  {
    const sample = out.exRights[0];
    if (sample) {
      const url = `https://www.twse.com.tw/rwd/zh/exRight/TWT49UDetail?STK_NO=${sample.symbol}&T1=${sample.exDate.replace(/-/g, "")}&response=json`;
      const r = await request(url);
      const row = r.json?.data?.[0] ?? [];
      console.log(`  ${sample.symbol} ${sample.exDate}：現金 ${String(row[2]).trim()}，每千股無償配股 ${String(row[4]).trim()}（${corsLabel(r.cors)}）`);
      await sleep(TWSE_WWW_GAP_MS);
    }
  }

  section("證交所 OpenAPI：TWT48U_ALL 除權除息預告表（只有最新一份，無參數）");
  {
    const r = await request("https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL");
    console.log(`  HTTP ${r.status}，${r.ms} ms，${r.json?.length ?? 0} 筆預告，${corsLabel(r.cors)}`);
    for (const row of r.json ?? []) {
      if (!TWSE_SYMBOLS.includes(row.Code)) continue;
      out.upcoming.push(row);
      console.log(`  ${row.Code} ${rocToIso(row.Date)} ${row.Exdividend} 現金 ${row.CashDividend || "（待公告）"}`);
    }
    if (out.upcoming.length === 0) console.log(`  ${TWSE_SYMBOLS.join("、")} 目前沒有預告`);
  }

  section("證交所 OpenAPI：holidaySchedule 今年休市日");
  {
    const r = await request("https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule");
    const rows = r.json ?? [];
    out.meta.holidays = rows.map((h) => ({ date: rocToIso(h.Date), name: h.Name }));
    console.log(`  HTTP ${r.status}，${rows.length} 筆（${out.meta.holidays[0]?.date} ～ ${out.meta.holidays.at(-1)?.date}），${corsLabel(r.cors)}`);
  }

  section("證交所 www：STOCK_DAY 最早可查日期");
  {
    const r = await request("https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20091201&stockNo=2330&response=json");
    console.log(`  查 2009/12：${r.json?.stat}`);
  }
  results.twse = out;
}

// ---------- 櫃買中心（上櫃） ----------

async function probeTpex() {
  section("櫃買中心 www：tradingStock 個股月成交（一次一檔一個月）");
  const out = { closes: {}, exRights: [] };
  for (const symbol of TPEX_SYMBOLS) {
    const rows = [];
    let cors = null;
    let totalMs = 0;
    for (const month of monthStarts()) {
      const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${symbol}&date=${ymd(month, "/")}&response=json`;
      const r = await request(url);
      cors = r.cors;
      totalMs += r.ms;
      // fields: 日期, 成交仟股, 成交仟元, 開盤, 最高, 最低, 收盤, 漲跌, 筆數
      for (const row of r.json?.tables?.[0]?.data ?? []) rows.push({ date: rocToIso(row[0]), close: num(row[6]) });
      await sleep(500);
    }
    const inRange = rows.filter((r) => r.date >= iso(oneYearAgo) && r.close !== null);
    out.closes[symbol] = inRange;
    console.log(`  ${symbol}: ${summarizeCloses(inRange)}（${monthStarts().length} 個請求、共 ${totalMs} ms，${corsLabel(cors)}）`);
  }

  section("櫃買中心 www：exDailyQ 除權除息計算結果（日期區間，全市場）");
  {
    const url = `https://www.tpex.org.tw/www/zh-tw/bulletin/exDailyQ?startDate=${ymd(oneYearAgo, "/")}&endDate=${ymd(today, "/")}&response=json`;
    const r = await request(url);
    const table = r.json?.tables?.[0];
    console.log(`  HTTP ${r.status}，${r.ms} ms，全市場 ${table?.data?.length ?? 0} 筆，${corsLabel(r.cors)}`);
    // fields: 除權息日期, 代號, 名稱, 除權息前收盤價, 除權息參考價, 權值, 息值, 權值+息值, 權/息, …, 現金股利(13), 每仟股無償配股(14)
    for (const row of table?.data ?? []) {
      const symbol = row[1].trim();
      if (!TPEX_SYMBOLS.includes(symbol)) continue;
      const item = {
        symbol,
        exDate: rocToIso(row[0]),
        closeBefore: num(row[3]),
        reference: num(row[4]),
        cash: num(row[13]),
        stockPerThousand: num(row[14]),
        kind: row[8],
      };
      out.exRights.push(item);
      console.log(`  ${symbol} ${item.exDate} ${item.kind} 現金 ${item.cash}、每千股配股 ${item.stockPerThousand}（前收 ${item.closeBefore} → 參考價 ${item.reference}）`);
    }
  }

  section("櫃買中心 OpenAPI：tpex_exright_prepost 除權除息預告表（只有最新一份）");
  {
    const r = await request("https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost");
    console.log(`  HTTP ${r.status}，${r.ms} ms，${r.json?.length ?? 0} 筆，${corsLabel(r.cors)}`);
    for (const row of r.json ?? []) {
      if (TPEX_SYMBOLS.includes(row.SecuritiesCompanyCode)) {
        console.log(`  ${row.SecuritiesCompanyCode} ${rocToIso(row.ExRrightsExDividendDate)} ${row.ExRrightsExDividend} 現金 ${row.CashDividend}`);
      }
    }
  }
  results.tpex = out;
}

// ---------- 公開資訊觀測站 ----------

async function probeMops() {
  section("公開資訊觀測站：t05st09_2 股利分派情形（新版網站背後的 JSON API）");
  const out = {};
  for (const symbol of ["2330", "6488", "0050"]) {
    const rocYear = today.getFullYear() - 1911;
    const body = JSON.stringify({ companyId: symbol, dataType: "2", firstYear: String(rocYear - 2), lastYear: String(rocYear), queryType: "1" });
    const r = await request("https://mops.twse.com.tw/mops/api/t05st09_2", {
      method: "POST",
      body,
      headers: { "Content-Type": "application/json" },
    });
    const rows = r.json?.result?.commonStock?.data ?? [];
    out[symbol] = rows;
    console.log(`  ${symbol}: ${r.json?.message ?? `HTTP ${r.status}`}，${rows.length} 筆，${corsLabel(r.cors)}`);
    // 欄位依序：決議進度, 股利所屬期間, 期間起迄, 期別, 董事會日期, 股東會日期, …, 盈餘分配之現金股利(10)
    for (const row of rows.slice(0, 3)) console.log(`    ${row[0]} ${row[1]} 董事會 ${row[4]} 現金股利 ${row[10]}（沒有除息日）`);
    await sleep(1000);
  }

  section("公開資訊觀測站：舊版 ajax_t05st09_2（表單 POST）");
  {
    const r = await request("https://mops.twse.com.tw/mops/web/ajax_t05st09_2", {
      method: "POST",
      body: "encodeURIComponent=1&step=1&firstin=1&off=1&queryName=co_id&inpuType=co_id&TYPEK=all&isnew=false&co_id=2330",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const blocked = r.text.includes("SECURITY REASONS");
    console.log(`  HTTP ${r.status}，${blocked ? "被安全性擋頁擋下（舊版已不能用程式查）" : `${r.bytes} bytes`}`);
  }
  results.mops = out;
}

// ---------- FinMind ----------

async function probeFinmind() {
  const token = process.env.FINMIND_TOKEN;
  const base = "https://api.finmindtrade.com/api/v4/data";
  const q = (dataset, extra) =>
    `${base}?dataset=${dataset}&${extra}${token ? `&token=${token}` : ""}`;
  const out = { closes: {}, dividends: {}, dividendResults: {}, splits: {} };
  section(`FinMind v4（${token ? "有 token" : "未帶 token"}）`);

  for (const symbol of [...TWSE_SYMBOLS, ...TPEX_SYMBOLS]) {
    const r = await request(q("TaiwanStockPrice", `data_id=${symbol}&start_date=${iso(oneYearAgo)}&end_date=${iso(today)}`));
    const rows = (r.json?.data ?? []).map((d) => ({ date: d.date, close: d.close }));
    out.closes[symbol] = rows;
    console.log(`  TaiwanStockPrice ${symbol}: ${summarizeCloses(rows)}（${r.ms} ms，${corsLabel(r.cors)}）`);
  }

  for (const symbol of [...TWSE_SYMBOLS, ...TPEX_SYMBOLS]) {
    const start = `${today.getFullYear() - 2}-01-01`;
    const r = await request(q("TaiwanStockDividend", `data_id=${symbol}&start_date=${start}`));
    const rows = (r.json?.data ?? [])
      .filter((d) => d.CashExDividendTradingDate || d.StockExDividendTradingDate)
      .map((d) => ({
        exDate: d.CashExDividendTradingDate || d.StockExDividendTradingDate,
        cash: Number((d.CashEarningsDistribution + d.CashStatutorySurplus).toFixed(8)),
        stockPerShare: d.StockEarningsDistribution + d.StockStatutorySurplus,
        payDate: d.CashDividendPaymentDate || null,
      }));
    out.dividends[symbol] = rows;
    console.log(`  TaiwanStockDividend ${symbol}: ${rows.length} 次`);
    for (const d of rows.slice(-4)) console.log(`    除息 ${d.exDate} 現金 ${d.cash} 配股 ${d.stockPerShare} 發放 ${d.payDate ?? "?"}`);
  }

  for (const symbol of TWSE_SYMBOLS) {
    const r = await request(q("TaiwanStockDividendResult", `data_id=${symbol}&start_date=${iso(oneYearAgo)}`));
    out.dividendResults[symbol] = r.json?.data ?? [];
    console.log(`  TaiwanStockDividendResult ${symbol}: ${out.dividendResults[symbol].map((d) => `${d.date} ${d.stock_and_cache_dividend}`).join("、") || "無"}`);
  }

  {
    const r = await request(q("TaiwanStockSplitPrice", `data_id=0050&start_date=2024-01-01`));
    out.splits["0050"] = r.json?.data ?? [];
    console.log(`  TaiwanStockSplitPrice 0050: ${out.splits["0050"].map((d) => `${d.date} ${d.type} ${d.before_price}→${d.after_price}`).join("、") || r.json?.msg}`);
  }

  {
    const r = await request(q("TaiwanStockPriceAdj", `data_id=0050&start_date=${iso(oneYearAgo)}`));
    console.log(`  TaiwanStockPriceAdj（還原股價）0050: HTTP ${r.status} ${r.json?.msg?.slice(0, 60) ?? ""}`);
  }

  {
    const r = await request(q("TaiwanStockTradingDate", `start_date=${iso(today)}`));
    console.log(`  TaiwanStockTradingDate 從今天起: ${(r.json?.data ?? []).slice(0, 5).map((d) => d.date).join("、")} …`);
  }

  {
    const r = await request(q("TaiwanStockPrice", "data_id=2330&start_date=1990-01-01&end_date=1995-01-01"));
    console.log(`  最早資料：2330 從 ${r.json?.data?.[0]?.date ?? "?"} 開始`);
  }
  results.finmind = out;
}

// ---------- Yahoo Finance（非官方） ----------

async function probeYahoo() {
  section("Yahoo Finance chart API（非官方、無文件）");
  const out = { closes: {}, adjCloses: {}, dividends: {} };
  const yahooSymbols = { "2330": "2330.TW", "0050": "0050.TW", "6488": "6488.TWO", "00679B": "00679B.TWO" };
  for (const [symbol, ticker] of Object.entries(yahooSymbols)) {
    const r = await request(`https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=1y&interval=1d&events=div%7Csplit`);
    const result = r.json?.chart?.result?.[0];
    if (!result) {
      console.log(`  ${ticker}: HTTP ${r.status} ${r.text.slice(0, 80)}`);
      continue;
    }
    const tz = result.meta.gmtoffset;
    const dateOf = (t) => new Date((t + tz) * 1000).toISOString().slice(0, 10);
    const closes = result.indicators.quote[0].close;
    const adj = result.indicators.adjclose?.[0]?.adjclose ?? [];
    out.closes[symbol] = result.timestamp.map((t, i) => ({ date: dateOf(t), close: closes[i] === null ? null : Number(closes[i].toFixed(2)) })).filter((x) => x.close !== null);
    out.adjCloses[symbol] = result.timestamp.map((t, i) => ({ date: dateOf(t), adj: adj[i] })).filter((x) => x.adj != null);
    out.dividends[symbol] = Object.values(result.events?.dividends ?? {}).map((d) => ({ exDate: dateOf(d.date), amount: d.amount }));
    console.log(`  ${ticker}: ${summarizeCloses(out.closes[symbol])}（${r.ms} ms，${corsLabel(r.cors)}）`);
    console.log(`    配息：${out.dividends[symbol].map((d) => `${d.exDate} ${d.amount}`).join("、") || "無"}`);
  }
  results.yahoo = out;
}

// ---------- 交叉比對 ----------

function crossCheck() {
  section("交叉比對：同一天的收盤價");
  const pairs = [
    ["twse", "finmind", TWSE_SYMBOLS],
    ["tpex", "finmind", TPEX_SYMBOLS],
    ["twse", "yahoo", TWSE_SYMBOLS],
  ];
  for (const [a, b, symbols] of pairs) {
    if (!results[a] || !results[b]) continue;
    for (const symbol of symbols) {
      const left = new Map((results[a].closes[symbol] ?? []).map((r) => [r.date, r.close]));
      const right = results[b].closes[symbol] ?? [];
      let same = 0;
      const diffs = [];
      for (const { date, close } of right) {
        if (!left.has(date)) continue;
        if (Math.abs(left.get(date) - close) < 0.005) same += 1;
        else diffs.push(`${date} ${left.get(date)} vs ${close}`);
      }
      const onlyLeft = [...left.keys()].filter((d) => !right.some((r) => r.date === d));
      console.log(`  ${a} vs ${b} ${symbol}: 相同 ${same} 天，不同 ${diffs.length} 天${diffs.length ? `（${diffs.slice(0, 3).join("；")}）` : ""}，${b} 缺 ${onlyLeft.length} 天${onlyLeft.length ? `（${onlyLeft.slice(0, 3).join("、")}）` : ""}`);
    }
  }

  section("還原收盤價：用證交所收盤價 + TWT49U 自己算，對 Yahoo adjclose");
  if (!results.twse || !results.yahoo) return;
  for (const symbol of TWSE_SYMBOLS) {
    const closes = results.twse.closes[symbol];
    const events = results.twse.exRights.filter((e) => e.symbol === symbol);
    // 往回調整：除權息日之前的每一天乘上 參考價 / 前收
    const adjusted = closes.map(({ date, close }) => {
      let factor = 1;
      for (const e of events) if (date < e.exDate) factor *= e.reference / e.closeBefore;
      return { date, adj: close * factor };
    });
    const yahoo = results.yahoo.adjCloses[symbol] ?? [];
    const first = adjusted[0];
    const last = adjusted.at(-1);
    const yFirst = yahoo.find((y) => y.date === first.date);
    const yLast = yahoo.find((y) => y.date === last.date);
    const ours = last.adj / first.adj - 1;
    const theirs = yFirst && yLast ? yLast.adj / yFirst.adj - 1 : NaN;
    const raw = last.adj / closes[0].close - 1;
    console.log(`  ${symbol} ${first.date} → ${last.date}：自算還原報酬 ${(ours * 100).toFixed(2)}%、Yahoo ${(theirs * 100).toFixed(2)}%、不還原 ${(raw * 100).toFixed(2)}%`);
  }
}

// ---------- 主程式 ----------

const runners = { twse: probeTwse, tpex: probeTpex, mops: probeMops, finmind: probeFinmind, yahoo: probeYahoo };
console.log(`試打期間 ${iso(oneYearAgo)} ～ ${iso(today)}；來源：${sources.join("、")}`);
for (const name of sources) {
  if (name === "check") continue;
  try {
    await runners[name]();
  } catch (error) {
    console.log(`  ${name} 失敗：${error.message}`);
  }
}
if (sources.includes("check")) crossCheck();
if (outPath) {
  writeFileSync(outPath, JSON.stringify({ ranAt: new Date().toISOString(), results }, null, 2));
  console.log(`\n完整結果存到 ${outPath}`);
}
