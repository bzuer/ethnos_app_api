const DEFAULT_MS = parseInt(process.env.DB_QUERY_TIMEOUT_MS || '6000', 10);

function secondsFromMs(ms) {
  const val = Number(ms);
  if (!Number.isFinite(val) || val <= 0) return 6; // sane default 6s
  return Math.max(0.1, Math.round((val / 1000) * 10) / 10); // 1 decimal
}

function withTimeout(sql, ms = DEFAULT_MS) {
  const secs = secondsFromMs(ms);
  return `SET STATEMENT max_statement_time=${secs} FOR ${sql}`;
}

module.exports = { withTimeout };

