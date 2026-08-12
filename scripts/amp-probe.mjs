/**
 * Amp environment probe.
 *
 * Answers one question before anyone spends time or money: *can this machine
 * run the Amp proof, and if not, which specific thing is missing?*
 *
 * This exists because the failure it diagnoses is silent and misleading. On the
 * machine where the proof was first attempted, `amp update` reported the CLI was
 * already current while Amp's own server rejected that exact build with HTTP
 * 426, and the account separately held zero credits. Neither is visible until a
 * run fails, and the 426 surfaces as "Unexpected error inside Amp CLI".
 *
 * By default this spends nothing. The live check is opt-in via `--live`,
 * because a supported CLI with credits *will* run the prompt and bill for it.
 *
 *   node scripts/amp-probe.mjs           # no-spend checks only
 *   node scripts/amp-probe.mjs --live    # adds one minimal real turn
 */

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const live = process.argv.includes("--live");

/** Never throw on a non-zero exit — a failed probe is a result, not an error. */
async function attempt(command, args, options = {}) {
  try {
    const { stdout, stderr } = await run(command, args, {
      timeout: 120_000,
      ...options,
    });
    return { ok: true, stdout, stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? String(error),
      code: error.code,
    };
  }
}

const checks = [];
const record = (id, status, detail) => {
  checks.push({ id, status, detail });
  const mark = status === "ok" ? "PASS" : status === "blocked" ? "BLOCK" : "WARN";
  console.log(`${mark.padEnd(5)} ${id.padEnd(26)} ${detail}`);
};

// 1. Installed, and what version? Reported for the record; the server decides
//    whether it is acceptable, and it does not always agree with `amp update`.
//    No shell here -- ENOENT is the "not installed" signal.
const version = await attempt("amp", ["--version"]);
if (!version.ok && version.code === "ENOENT") {
  record("cli_installed", "blocked", "amp not found on PATH");
  console.log("\nVERDICT blocked_environment — install Amp first.");
  process.exit(1);
}
record("cli_installed", "ok", "on PATH");
record("cli_version", "ok", version.stdout.trim().split("\n")[0] ?? "unknown");

// 3. Authenticated, and does the account hold credits? `amp usage` succeeds
//    even on a build the inference path rejects, so this cannot stand in for
//    the version check.
const usage = await attempt("amp", ["usage"]);
if (!usage.ok) {
  record("authenticated", "blocked", usage.stderr.trim().split("\n")[0] ?? "amp usage failed");
} else {
  const text = usage.stdout;
  const signedIn = /Signed in as (.+)/.exec(text);
  record("authenticated", "ok", signedIn ? signedIn[1].trim() : "signed in");

  const credits = /credits?:\s*\$?([0-9.]+)/i.exec(text);
  if (credits && Number(credits[1]) === 0) {
    record("credits_available", "blocked", `$${credits[1]} remaining`);
  } else {
    record("credits_available", credits ? "ok" : "warn", credits ? `$${credits[1]}` : "balance not reported");
  }
}

// 4. Does the server accept this build? Only a real turn answers this, so it is
//    opt-in. A rejected build fails before any model call and costs nothing; an
//    accepted one runs the prompt and bills for it.
if (!live) {
  record(
    "server_accepts_cli",
    "warn",
    "not checked — re-run with --live (may spend on a supported CLI)",
  );
} else {
  const dir = await mkdtemp(join(tmpdir(), "amp-probe-"));
  try {
    // The message goes as an argument to -x. An earlier version passed it via
    // an `input` option, which execFile does not support: amp received no
    // prompt, emitted nothing, and the probe reported warnings instead of the
    // 426 it was written to catch.
    const probe = await attempt(
      "amp",
      ["-x", "Reply with the single word: ok", "--stream-json", "--dangerously-allow-all"],
      { cwd: dir },
    );
    const lines = `${probe.stdout}`.trim().split("\n").filter(Boolean);
    const parsed = lines.map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    });
    const init = parsed.find((event) => event?.subtype === "init");
    const result = parsed.find((event) => event?.type === "result");

    // No stream at all means the CLI died before emitting anything. The reason
    // is on stderr and is worth surfacing verbatim: on a corporate machine the
    // most likely cause is an egress proxy, which otherwise shows up here as an
    // unexplained absence.
    if (lines.length === 0) {
      const reason = probe.stderr.replace(/\u001b\[[0-9;=<?]*[a-zA-Z]/g, "").trim().split("\n")[0] ?? "no output";
      const network = /network|proxy|timeout|ENOTFOUND|ECONN/i.test(reason);
      record(
        "server_accepts_cli",
        "blocked",
        network
          ? `cannot reach Amp: ${reason} — check HTTPS_PROXY / NO_PROXY and the corporate TLS bundle`
          : `no stream emitted: ${reason}`,
      );
    } else if (init) {
      record("stream_telemetry", "ok", `thread ${init.session_id}, ${init.tools?.length ?? 0} tools, mcp ${JSON.stringify(init.mcp_servers ?? [])}`);
    } else {
      record("stream_telemetry", "warn", "stream emitted but no init event");
    }

    if (lines.length === 0) {
      // already recorded above
    } else if (result?.is_error) {
      const message = String(result.error ?? "");
      const unsupported = message.includes("426") || /no longer supported/i.test(message);
      record(
        "server_accepts_cli",
        "blocked",
        unsupported
          ? "HTTP 426 — server rejects this build. `amp update` may wrongly report it current; reinstall per Amp's instructions."
          : message.slice(0, 160),
      );
    } else if (result) {
      record("server_accepts_cli", "ok", `completed in ${result.duration_ms}ms, ${result.num_turns} turn(s)`);
    } else {
      record("server_accepts_cli", "warn", "no terminal result event");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const blocked = checks.filter((check) => check.status === "blocked");
console.log("");
if (blocked.length === 0 && live) {
  console.log("VERDICT ready — the Amp proof can run on this machine.");
} else if (blocked.length === 0) {
  console.log("VERDICT no blockers found in no-spend checks. Re-run with --live to confirm the server accepts this CLI.");
} else {
  console.log(`VERDICT blocked_environment — ${blocked.map((check) => check.id).join(", ")}`);
  process.exitCode = 1;
}
