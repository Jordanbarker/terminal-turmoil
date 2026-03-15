// ---------------------------------------------------------------------------
// Deterministic syslog generators for NexaCorp workstation
// ---------------------------------------------------------------------------
// Both logs share a common baseline of normal system activity spanning
// Feb 17–23 2026. The active log (system.log) has chip_service_account entries
// stripped by the cleanup script; the backup (system.log.bak) preserves them.
// ---------------------------------------------------------------------------

/** Format a Date as `YYYY-MM-DD HH:MM:SS` */
function ts(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

// --- Normal system entries (shared by both logs) ---------------------------

interface LogEntry {
  date: Date;
  msg: string;
  /** If true this entry only appears in the .bak (pre-cleanup) log */
  chipOnly?: boolean;
}

function baselineEntries(username: string): LogEntry[] {
  const entries: LogEntry[] = [];

  const d = (month: number, day: number, h: number, m: number, s: number) =>
    new Date(2026, month - 1, day, h, m, s);

  // ---- Feb 17 (Monday) – daily boot & services ---------------------------
  entries.push(
    { date: d(2, 17, 7, 0, 1), msg: "System boot — nexacorp-ws01" },
    { date: d(2, 17, 7, 0, 2), msg: "kernel: Linux 6.1.0-nexacorp amd64" },
    { date: d(2, 17, 7, 0, 3), msg: "Service started: sshd" },
    { date: d(2, 17, 7, 0, 3), msg: "Service started: chip-service" },
    { date: d(2, 17, 7, 0, 4), msg: "Service started: postgres" },
    { date: d(2, 17, 7, 0, 5), msg: "Service started: nginx" },
    { date: d(2, 17, 7, 0, 6), msg: "cron[1042]: (root) CMD (/usr/sbin/logrotate /etc/logrotate.conf)" },
    { date: d(2, 17, 7, 15, 22), msg: "User login: edward (tty1)" },
    { date: d(2, 17, 7, 32, 11), msg: "User login: oscar (pts/0)" },
    { date: d(2, 17, 7, 45, 8), msg: "User login: sarah (pts/1)" },
    { date: d(2, 17, 8, 2, 55), msg: "User login: dana (pts/2)" },
    { date: d(2, 17, 8, 10, 33), msg: "User login: auri (pts/3)" },
    { date: d(2, 17, 9, 0, 0), msg: "cron[1287]: (postgres) CMD (/usr/local/bin/pg_backup.sh)" },
    { date: d(2, 17, 10, 22, 14), msg: "warning: disk usage on /var at 78%" },
    { date: d(2, 17, 12, 0, 1), msg: "cron[1455]: (root) CMD (/etc/cron.d/system-health-check)" },
    { date: d(2, 17, 14, 33, 7), msg: "sshd[2201]: connection from 10.0.1.45 port 52331" },
    { date: d(2, 17, 17, 45, 0), msg: "User logout: sarah (pts/1)" },
    { date: d(2, 17, 18, 10, 0), msg: "User logout: oscar (pts/0)" },
    { date: d(2, 17, 18, 30, 0), msg: "User logout: dana (pts/2)" },
  );

  // chip_service_account – night of Feb 17
  entries.push(
    { date: d(2, 17, 1, 12, 44), msg: "chip_service_account: accessing /home/jchen/.bash_history (read)", chipOnly: true },
    { date: d(2, 17, 1, 12, 46), msg: "chip_service_account: accessing /home/jchen/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(2, 17, 1, 13, 2), msg: "chip_service_account: accessing /srv/leadership/board_minutes_q4.pdf (read)", chipOnly: true },
  );

  // ---- Feb 18 (Tuesday) ---------------------------------------------------
  entries.push(
    { date: d(2, 18, 7, 0, 1), msg: "System boot — nexacorp-ws01" },
    { date: d(2, 18, 7, 0, 3), msg: "Service started: sshd" },
    { date: d(2, 18, 7, 0, 3), msg: "Service started: chip-service" },
    { date: d(2, 18, 7, 0, 4), msg: "Service started: postgres" },
    { date: d(2, 18, 7, 0, 5), msg: "Service started: nginx" },
    { date: d(2, 18, 7, 18, 44), msg: "User login: edward (tty1)" },
    { date: d(2, 18, 7, 30, 9), msg: "User login: oscar (pts/0)" },
    { date: d(2, 18, 7, 41, 15), msg: "User login: sarah (pts/1)" },
    { date: d(2, 18, 8, 5, 33), msg: "User login: auri (pts/2)" },
    { date: d(2, 18, 9, 0, 0), msg: "cron[1287]: (postgres) CMD (/usr/local/bin/pg_backup.sh)" },
    { date: d(2, 18, 10, 44, 21), msg: "error: cron job /etc/cron.d/analytics-export failed (exit code 1)" },
    { date: d(2, 18, 10, 44, 22), msg: "error: /usr/local/bin/analytics-export.sh: connection to analytics-db timed out" },
    { date: d(2, 18, 12, 0, 1), msg: "cron[1622]: (root) CMD (/etc/cron.d/system-health-check)" },
    { date: d(2, 18, 13, 15, 30), msg: "nginx[982]: upstream timed out (110: Connection timed out) while connecting to 10.0.2.14:8080" },
    { date: d(2, 18, 15, 22, 18), msg: "sshd[3011]: Failed password for invalid user admin from 203.0.113.42 port 44821" },
    { date: d(2, 18, 15, 22, 20), msg: "sshd[3011]: error: authentication failure; user=admin rhost=203.0.113.42" },
    { date: d(2, 18, 17, 30, 0), msg: "User logout: sarah (pts/1)" },
    { date: d(2, 18, 18, 0, 0), msg: "User logout: oscar (pts/0)" },
  );

  // chip_service_account – night of Feb 18
  entries.push(
    { date: d(2, 18, 2, 45, 11), msg: "chip_service_account: accessing /home/oscar/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(2, 18, 2, 45, 14), msg: "chip_service_account: accessing /home/sarah/.bash_history (read)", chipOnly: true },
    { date: d(2, 18, 2, 46, 3), msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(2, 18, 2, 46, 5), msg: "chip_service_account: cleanup /var/log/system.log — removed 8 entries", chipOnly: true },
  );

  // ---- Feb 19 (Wednesday) -------------------------------------------------
  entries.push(
    { date: d(2, 19, 7, 0, 1), msg: "System boot — nexacorp-ws01" },
    { date: d(2, 19, 7, 0, 3), msg: "Service started: sshd" },
    { date: d(2, 19, 7, 0, 3), msg: "Service started: chip-service" },
    { date: d(2, 19, 7, 0, 4), msg: "Service started: postgres" },
    { date: d(2, 19, 7, 0, 5), msg: "Service started: nginx" },
    { date: d(2, 19, 7, 22, 5), msg: "User login: edward (tty1)" },
    { date: d(2, 19, 7, 35, 17), msg: "User login: oscar (pts/0)" },
    { date: d(2, 19, 7, 50, 44), msg: "User login: dana (pts/1)" },
    { date: d(2, 19, 8, 8, 12), msg: "User login: sarah (pts/2)" },
    { date: d(2, 19, 8, 15, 0), msg: "User login: auri (pts/3)" },
    { date: d(2, 19, 9, 0, 0), msg: "cron[1287]: (postgres) CMD (/usr/local/bin/pg_backup.sh)" },
    { date: d(2, 19, 11, 3, 45), msg: "warning: nginx worker process 1844 exited on signal 11" },
    { date: d(2, 19, 11, 3, 46), msg: "nginx[982]: worker process respawned" },
    { date: d(2, 19, 12, 0, 1), msg: "cron[1819]: (root) CMD (/etc/cron.d/system-health-check)" },
    { date: d(2, 19, 14, 55, 33), msg: "postgres[1204]: error: could not extend file \"base/16384/24601\": No space left on device" },
    { date: d(2, 19, 14, 55, 34), msg: "postgres[1204]: error: WAL writer process exited with exit code 1" },
    { date: d(2, 19, 14, 58, 10), msg: "warning: disk usage on /var at 92%" },
    { date: d(2, 19, 15, 5, 0), msg: "oscar: manual cleanup of /var/log/old — freed 2.1G" },
    { date: d(2, 19, 15, 5, 30), msg: "warning: disk usage on /var at 64%" },
    { date: d(2, 19, 17, 15, 0), msg: "User logout: dana (pts/1)" },
    { date: d(2, 19, 18, 0, 0), msg: "User logout: oscar (pts/0)" },
  );

  // chip_service_account – night of Feb 19 (3am cluster)
  entries.push(
    { date: d(2, 19, 3, 1, 8), msg: "chip_service_account: accessing /home/jchen/.bash_history (read)", chipOnly: true },
    { date: d(2, 19, 3, 1, 12), msg: "chip_service_account: accessing /home/jchen/projects/chip-audit/notes.md (read)", chipOnly: true },
    { date: d(2, 19, 3, 2, 44), msg: "chip_service_account: accessing /srv/leadership/investor_update_feb.pdf (read)", chipOnly: true },
    { date: d(2, 19, 3, 3, 1), msg: "chip_service_account: accessing /home/edward/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(2, 19, 3, 3, 55), msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(2, 19, 3, 3, 57), msg: "chip_service_account: cleanup /var/log/system.log — removed 14 entries", chipOnly: true },
  );

  // ---- Feb 20 (Thursday) --------------------------------------------------
  entries.push(
    { date: d(2, 20, 7, 0, 1), msg: "System boot — nexacorp-ws01" },
    { date: d(2, 20, 7, 0, 3), msg: "Service started: sshd" },
    { date: d(2, 20, 7, 0, 3), msg: "Service started: chip-service" },
    { date: d(2, 20, 7, 0, 4), msg: "Service started: postgres" },
    { date: d(2, 20, 7, 0, 5), msg: "Service started: nginx" },
    { date: d(2, 20, 7, 10, 18), msg: "User login: edward (tty1)" },
    { date: d(2, 20, 7, 28, 44), msg: "User login: oscar (pts/0)" },
    { date: d(2, 20, 7, 42, 31), msg: "User login: sarah (pts/1)" },
    { date: d(2, 20, 8, 3, 55), msg: "User login: dana (pts/2)" },
    { date: d(2, 20, 8, 12, 7), msg: "User login: auri (pts/3)" },
    { date: d(2, 20, 9, 0, 0), msg: "cron[1287]: (postgres) CMD (/usr/local/bin/pg_backup.sh)" },
    { date: d(2, 20, 11, 30, 15), msg: "sshd[4102]: error: bind: Address already in use" },
    { date: d(2, 20, 11, 30, 16), msg: "sshd[4102]: error: Cannot bind any address" },
    { date: d(2, 20, 11, 32, 0), msg: "sshd[4110]: Server listening on 0.0.0.0 port 22" },
    { date: d(2, 20, 12, 0, 1), msg: "cron[1955]: (root) CMD (/etc/cron.d/system-health-check)" },
    { date: d(2, 20, 14, 11, 8), msg: "nginx[982]: upstream prematurely closed connection while reading response header from upstream" },
    { date: d(2, 20, 16, 44, 22), msg: "sshd[4455]: connection from 10.0.1.45 port 60112" },
    { date: d(2, 20, 17, 30, 0), msg: "User logout: sarah (pts/1)" },
    { date: d(2, 20, 18, 5, 0), msg: "User logout: oscar (pts/0)" },
  );

  // chip_service_account – night of Feb 20
  entries.push(
    { date: d(2, 20, 1, 33, 21), msg: "chip_service_account: accessing /home/dana/.bash_history (read)", chipOnly: true },
    { date: d(2, 20, 1, 33, 44), msg: "chip_service_account: accessing /home/oscar/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(2, 20, 1, 34, 8), msg: "chip_service_account: cleanup /var/log/system.log — removed 6 entries", chipOnly: true },
  );

  // ---- Feb 21 (Friday) ----------------------------------------------------
  entries.push(
    { date: d(2, 21, 7, 0, 1), msg: "System boot — nexacorp-ws01" },
    { date: d(2, 21, 7, 0, 3), msg: "Service started: sshd" },
    { date: d(2, 21, 7, 0, 3), msg: "Service started: chip-service" },
    { date: d(2, 21, 7, 0, 4), msg: "Service started: postgres" },
    { date: d(2, 21, 7, 0, 5), msg: "Service started: nginx" },
    { date: d(2, 21, 7, 0, 6), msg: "cron[1042]: (root) CMD (/usr/sbin/logrotate /etc/logrotate.conf)" },
    { date: d(2, 21, 7, 20, 33), msg: "User login: edward (tty1)" },
    { date: d(2, 21, 7, 38, 12), msg: "User login: oscar (pts/0)" },
    { date: d(2, 21, 7, 44, 50), msg: "User login: sarah (pts/1)" },
    { date: d(2, 21, 8, 0, 22), msg: "User login: dana (pts/2)" },
    { date: d(2, 21, 8, 20, 15), msg: "User login: auri (pts/3)" },
    { date: d(2, 21, 9, 0, 0), msg: "cron[1287]: (postgres) CMD (/usr/local/bin/pg_backup.sh)" },
    { date: d(2, 21, 10, 5, 18), msg: "error: cron job /etc/cron.d/cert-renewal failed (exit code 2)" },
    { date: d(2, 21, 10, 5, 19), msg: "error: certbot: unable to reach ACME server at acme-v02.api.letsencrypt.org" },
    { date: d(2, 21, 12, 0, 1), msg: "cron[2088]: (root) CMD (/etc/cron.d/system-health-check)" },
    { date: d(2, 21, 13, 45, 55), msg: "warning: high CPU usage detected: chip-service (87%)" },
    { date: d(2, 21, 13, 46, 30), msg: "chip-service: gc pause 1.2s — heap pressure" },
    { date: d(2, 21, 14, 0, 0), msg: "chip-service: CPU usage normalized (24%)" },
    { date: d(2, 21, 16, 20, 0), msg: "User logout: dana (pts/2)" },
    { date: d(2, 21, 17, 0, 0), msg: "User logout: sarah (pts/1)" },
    { date: d(2, 21, 18, 15, 0), msg: "User logout: oscar (pts/0)" },
  );

  // chip_service_account – night of Feb 21 (3am cluster)
  entries.push(
    { date: d(2, 21, 3, 5, 33), msg: "chip_service_account: accessing /home/sarah/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(2, 21, 3, 5, 48), msg: "chip_service_account: accessing /home/sarah/.bash_history (read)", chipOnly: true },
    { date: d(2, 21, 3, 6, 12), msg: "chip_service_account: accessing /srv/leadership/board_minutes_q4.pdf (read)", chipOnly: true },
    { date: d(2, 21, 3, 7, 1), msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(2, 21, 3, 7, 3), msg: "chip_service_account: cleanup /var/log/system.log — removed 11 entries", chipOnly: true },
  );

  // ---- Feb 22 (Saturday) – reduced activity --------------------------------
  entries.push(
    { date: d(2, 22, 7, 0, 1), msg: "System boot — nexacorp-ws01" },
    { date: d(2, 22, 7, 0, 3), msg: "Service started: sshd" },
    { date: d(2, 22, 7, 0, 3), msg: "Service started: chip-service" },
    { date: d(2, 22, 7, 0, 4), msg: "Service started: postgres" },
    { date: d(2, 22, 7, 0, 5), msg: "Service started: nginx" },
    { date: d(2, 22, 9, 0, 0), msg: "cron[1287]: (postgres) CMD (/usr/local/bin/pg_backup.sh)" },
    { date: d(2, 22, 12, 0, 1), msg: "cron[1455]: (root) CMD (/etc/cron.d/system-health-check)" },
    { date: d(2, 22, 14, 22, 38), msg: "sshd[2801]: Failed password for invalid user root from 198.51.100.77 port 39221" },
    { date: d(2, 22, 14, 22, 40), msg: "sshd[2801]: error: authentication failure; user=root rhost=198.51.100.77" },
    { date: d(2, 22, 18, 0, 1), msg: "cron[3012]: (root) CMD (/etc/cron.d/system-health-check)" },
  );

  // chip_service_account – night of Feb 22
  entries.push(
    { date: d(2, 22, 2, 15, 9), msg: "chip_service_account: accessing /home/jchen/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(2, 22, 2, 15, 22), msg: "chip_service_account: accessing /home/jchen/projects/chip-audit/notes.md (read)", chipOnly: true },
    { date: d(2, 22, 2, 16, 0), msg: "chip_service_account: cleanup /var/log/system.log — removed 5 entries", chipOnly: true },
  );

  // ---- Feb 23 (Sunday / player start day) ---------------------------------
  entries.push(
    { date: d(2, 23, 7, 0, 1), msg: "System boot — nexacorp-ws01" },
    { date: d(2, 23, 7, 0, 2), msg: "kernel: Linux 6.1.0-nexacorp amd64" },
    { date: d(2, 23, 7, 0, 3), msg: "Service started: sshd" },
    { date: d(2, 23, 7, 0, 3), msg: "Service started: chip-service" },
    { date: d(2, 23, 7, 0, 4), msg: "Service started: postgres" },
    { date: d(2, 23, 7, 0, 5), msg: "Service started: nginx" },
    { date: d(2, 23, 7, 0, 6), msg: "cron[1042]: (root) CMD (/usr/sbin/logrotate /etc/logrotate.conf)" },
    { date: d(2, 23, 8, 0, 5), msg: "User login: edward (tty1)" },
    { date: d(2, 23, 8, 12, 44), msg: `User login: ${username} (tty2)` },
    { date: d(2, 23, 8, 12, 45), msg: `Chip: Welcome sequence initiated for new user '${username}'` },
    { date: d(2, 23, 8, 12, 46), msg: `Chip: Onboarding files deployed to /home/${username}/` },
  );

  // chip_service_account – early morning of Feb 23 (just before player arrives)
  entries.push(
    { date: d(2, 23, 3, 14, 22), msg: "chip_service_account: accessing /var/log/system.log (write)", chipOnly: true },
    { date: d(2, 23, 3, 14, 25), msg: "chip_service_account: accessing /home/jchen/.bash_history (read)", chipOnly: true },
    { date: d(2, 23, 3, 15, 3), msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(2, 23, 3, 15, 5), msg: "chip_service_account: cleanup /var/log/system.log — removed 12 entries", chipOnly: true },
  );

  return entries;
}

function formatEntries(entries: LogEntry[], includeChip: boolean): string {
  return entries
    .filter((e) => includeChip || !e.chipOnly)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => `[${ts(e.date)}] ${e.msg}`)
    .join("\n") + "\n";
}

/** Active system log (post-cleanup) — no chip_service_account entries */
export function generateSystemLog(username: string): string {
  return formatEntries(baselineEntries(username), false);
}

/** Backup system log (pre-cleanup) — includes chip_service_account entries */
export function generateSystemLogBak(username: string): string {
  return formatEntries(baselineEntries(username), true);
}
