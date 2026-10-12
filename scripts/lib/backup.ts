import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Daily backups of the local site (spec section 12: database and original
 * pictures), made by the desktop launcher before it starts the database:
 *  - the stopped database folder is copied as a whole (a consistent "cold"
 *    copy, restored by copying it back), the newest `keep` days are kept;
 *  - stored files (originals, final pictures, wall images) are mirrored:
 *    new and changed files are copied, nothing is ever deleted from the mirror.
 * The folder is BACKUP_DIR or .data/backups.
 */

export function backupDir(): string {
  return path.resolve(process.env.BACKUP_DIR || ".data/backups");
}

const today = () => new Date().toISOString().slice(0, 10);

/** Copy files that are new or changed since the last mirror run. */
function mirror(from: string, to: string): number {
  if (!existsSync(from)) return 0;
  let copied = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copied += mirror(src, dst);
    } else if (entry.isFile()) {
      const s = statSync(src);
      const d = existsSync(dst) ? statSync(dst) : null;
      if (!d || d.size !== s.size || d.mtimeMs < s.mtimeMs) {
        mkdirSync(to, { recursive: true });
        cpSync(src, dst, { preserveTimestamps: true });
        copied++;
      }
    }
  }
  return copied;
}

/**
 * Back up once a day. `dbDir` must belong to a stopped database server.
 * Returns what was done, or null when today's backup exists already.
 */
export function dailyBackup(dbDir: string, storageDir: string, keep = 7): { dir: string; files: number } | null {
  const root = backupDir();
  const dir = path.join(root, `db-${today()}`);
  if (existsSync(dir)) return null;
  mkdirSync(root, { recursive: true });
  if (existsSync(path.join(dbDir, "PG_VERSION"))) {
    // postmaster.pid would make the copy look like a running server.
    cpSync(dbDir, dir, { recursive: true, filter: (src) => path.basename(src) !== "postmaster.pid" });
  }
  const files = mirror(storageDir, path.join(root, "storage"));
  const old = readdirSync(root)
    .filter((name) => /^db-\d{4}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse()
    .slice(keep);
  for (const name of old) rmSync(path.join(root, name), { recursive: true, force: true });
  return { dir, files };
}
