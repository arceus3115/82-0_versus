/**
 * Builds public/data/players.json from Kaggle historical NBA dataset.
 * Source: https://www.kaggle.com/datasets/eoinamoore/historical-nba-data-and-player-box-scores
 */
import { createWriteStream, existsSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_PATH = join(ROOT, "public/data/players.json");
const CACHE_ZIP = join(ROOT, ".cache/kaggle-nba.zip");
const CACHE_CSV = join(ROOT, ".cache/PlayerStatisticsExtended.csv");
const KAGGLE_URL =
  "https://www.kaggle.com/api/v1/datasets/download/eoinamoore/historical-nba-data-and-player-box-scores";

const MIN_GAMES = 20;
const MIN_TOTAL_MINUTES = 600;
const SEASON_START = 0;

const TEAM_TICKERS = {
  Hawks: "ATL",
  Celtics: "BOS",
  Nets: "BKN",
  Hornets: "CHA",
  Bulls: "CHI",
  Cavaliers: "CLE",
  Mavericks: "DAL",
  Nuggets: "DEN",
  Pistons: "DET",
  Warriors: "GSW",
  Rockets: "HOU",
  Pacers: "IND",
  Clippers: "LAC",
  Lakers: "LAL",
  Grizzlies: "MEM",
  Heat: "MIA",
  Bucks: "MIL",
  Timberwolves: "MIN",
  Pelicans: "NOP",
  Knicks: "NYK",
  Thunder: "OKC",
  Magic: "ORL",
  "76ers": "PHI",
  Sixers: "PHI",
  Suns: "PHX",
  "Trail Blazers": "POR",
  Blazers: "POR",
  Kings: "SAC",
  Spurs: "SAS",
  Raptors: "TOR",
  Jazz: "UTA",
  Wizards: "WAS",
};

function teamTicker(teamName) {
  if (!teamName) return "NBA";
  return TEAM_TICKERS[teamName] ?? teamName.slice(0, 3).toUpperCase();
}

function seasonKey(dateStr) {
  const d = new Date(dateStr);
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const start = month >= 10 ? year : year - 1;
  const end = (start + 1) % 100;
  return `${start}-${String(end).padStart(2, "0")}`;
}

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

async function downloadDataset() {
  console.log("[data] downloading Kaggle dataset…");
  const response = await fetch(KAGGLE_URL);
  if (!response.ok) {
    throw new Error(`Kaggle download failed (${response.status})`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const { writeFileSync } = await import("fs");
  writeFileSync(CACHE_ZIP, buffer);
}

function ensureDataset() {
  mkdirSync(join(ROOT, ".cache"), { recursive: true });
  if (!existsSync(CACHE_ZIP)) {
    throw new Error("MISSING_ZIP");
  }
  if (!existsSync(CACHE_CSV)) {
    console.log("[data] extracting PlayerStatisticsExtended.csv…");
    execSync(`unzip -p "${CACHE_ZIP}" PlayerStatisticsExtended.csv > "${CACHE_CSV}"`, {
      stdio: "inherit",
      shell: true,
    });
  }
}

function num(cols, idx, key) {
  const v = parseFloat(cols[idx[key]]);
  return Number.isFinite(v) ? v : 0;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

const POSITION_ORDER = ["PG", "SG", "SF", "PF", "C"];

function inferGuardRole(ast) {
  return ast >= 5.5 ? "PG" : "SG";
}

function inferForwardRole(trb, ast) {
  return trb >= 7.5 && ast < 4 ? "PF" : "SF";
}

function inferPositionsFromStarts(startCounts, stats) {
  const total = startCounts.G + startCounts.F + startCounts.C;
  if (total < 5) return inferPositionsFromStats(stats);

  const threshold = Math.max(5, total * 0.18);
  const positions = [];

  if (startCounts.C >= threshold) positions.push("C");

  if (startCounts.G >= threshold) {
    const guardShare = startCounts.G / total;
    if (guardShare >= 0.35 && stats.AST >= 4.8) {
      positions.push("PG", "SG");
    } else {
      positions.push(inferGuardRole(stats.AST));
    }
  }

  if (startCounts.F >= threshold) {
    const forwardShare = startCounts.F / total;
    if (forwardShare >= 0.35 && stats.TRB >= 6.5) {
      positions.push("SF", "PF");
    } else {
      positions.push(inferForwardRole(stats.TRB, stats.AST));
    }
  }

  if (positions.length === 0) return inferPositionsFromStats(stats);

  return [...new Set(positions)].sort(
    (a, b) => POSITION_ORDER.indexOf(a) - POSITION_ORDER.indexOf(b),
  );
}

function inferPositionsFromStats(stats) {
  const { PTS, AST, TRB, BLK } = stats;
  if (BLK >= 1.5 && TRB >= 9) return ["C"];
  if (TRB >= 8.5 && AST < 3.5) return ["PF"];
  if (AST >= 6.5 && TRB < 5) return ["PG"];
  if (AST >= 4 && TRB < 6.5) return ["SG"];
  if (TRB >= 6.5 && AST >= 4) return ["SF"];
  if (PTS >= 20 && AST >= 5) return ["SG"];
  return ["SF"];
}

async function build() {
  mkdirSync(join(ROOT, ".cache"), { recursive: true });
  if (!existsSync(CACHE_ZIP)) {
    await downloadDataset();
  }
  ensureDataset();

  const buckets = new Map();
  const rl = createInterface({ input: createReadStream(CACHE_CSV), crlfDelay: Infinity });
  let idx = {};

  console.log("[data] aggregating regular-season player-seasons…");
  for await (const line of rl) {
    if (!Object.keys(idx).length) {
      const headers = parseCsvLine(line);
      headers.forEach((h, i) => {
        idx[h] = i;
      });
      continue;
    }

    const cols = parseCsvLine(line);
    if (cols[idx.gameType] !== "Regular Season") continue;

    const season = seasonKey(cols[idx.gameDateTimeEst]);
    const startYear = parseInt(season.split("-")[0], 10);
    if (startYear < SEASON_START) continue;

    const personId = cols[idx.personId];
    const key = `${personId}|${season}`;
    const minutes = num(cols, idx, "numMinutes");
    if (minutes <= 0) continue;

    let row = buckets.get(key);
    if (!row) {
      row = {
        player_name: `${cols[idx.firstName]} ${cols[idx.lastName]}`.trim(),
        season,
        teamCounts: new Map(),
        games: 0,
        MP: 0,
        PTS: 0,
        AST: 0,
        TRB: 0,
        STL: 0,
        BLK: 0,
        TOV: 0,
        tsWeighted: 0,
        fgaWeighted: 0,
        netWeighted: 0,
        minuteWeighted: 0,
        startCounts: { G: 0, F: 0, C: 0 },
      };
      buckets.set(key, row);
    }

    const startPos = cols[idx.startingPosition] ?? "";
    if (startPos === "G") row.startCounts.G += 1;
    else if (startPos === "F") row.startCounts.F += 1;
    else if (startPos === "C") row.startCounts.C += 1;

    const fga = num(cols, idx, "fieldGoalsAttempted");
    const teamName = cols[idx.playerteamName] ?? "";
    row.teamCounts.set(teamName, (row.teamCounts.get(teamName) ?? 0) + 1);
    row.games += 1;
    row.MP += minutes;
    row.PTS += num(cols, idx, "points");
    row.AST += num(cols, idx, "assists");
    row.TRB += num(cols, idx, "reboundsTotal");
    row.STL += num(cols, idx, "steals");
    row.BLK += num(cols, idx, "blocks");
    row.TOV += num(cols, idx, "turnovers");
    row.tsWeighted += num(cols, idx, "trueShootingPercentage") * fga;
    row.fgaWeighted += fga;
    row.netWeighted += num(cols, idx, "netRating") * minutes;
    row.minuteWeighted += minutes;
  }

  const players = [];
  let id = 1;

  for (const row of buckets.values()) {
    if (row.games < MIN_GAMES || row.MP < MIN_TOTAL_MINUTES) continue;

    const TS_pct = row.fgaWeighted > 0 ? (row.tsWeighted / row.fgaWeighted) * 100 : 50;
    const netPer100 = row.minuteWeighted > 0 ? row.netWeighted / row.minuteWeighted : 0;
    const BPM = Math.max(-8, Math.min(15, netPer100 * 0.45));
    const TOV_pct = row.MP > 0 ? (row.TOV / ((row.MP / 48) * 100)) * 100 : 12;

    const stats = {
      PTS: row.PTS / row.games,
      AST: row.AST / row.games,
      TRB: row.TRB / row.games,
      STL: row.STL / row.games,
      BLK: row.BLK / row.games,
    };

    const positions = inferPositionsFromStarts(row.startCounts, stats);

    let topTeam = "";
    let topGames = 0;
    for (const [team, games] of row.teamCounts) {
      if (games > topGames) {
        topTeam = team;
        topGames = games;
      }
    }

    players.push({
      id: `ps-${id++}`,
      player_name: row.player_name,
      season: row.season,
      team_ticker: teamTicker(topTeam),
      positions,
      PTS: round1(stats.PTS),
      AST: round1(stats.AST),
      TRB: round1(stats.TRB),
      STL: round1(stats.STL),
      BLK: round1(stats.BLK),
      MP: Math.round(row.MP),
      BPM: round1(BPM),
      TS_pct: round1(TS_pct),
      TOV_pct: round1(Math.min(25, Math.max(5, TOV_pct))),
    });
  }

  players.sort((a, b) => b.BPM - a.BPM || b.MP - a.MP);
  mkdirSync(dirname(OUT_PATH), { recursive: true });

  await pipeline(async function* () {
    yield JSON.stringify(players);
  }, createWriteStream(OUT_PATH));

  console.log(`[data] wrote ${players.length} player-seasons → ${OUT_PATH}`);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
