// The image starts as root only to hand /data to its owner (PUID/PGID, else whoever owns the mounted folder, 1000 if that is root),
// then drops to that user and starts the service.
import { chownSync, statSync } from "node:fs";

if (process.getuid?.() === 0) {
  const dataDir = process.env.DATA_DIR ?? "/data";
  const data = statSync(dataDir);
  const uid = Number(process.env.PUID || data.uid) || 1000;
  const gid = Number(process.env.PGID || data.gid) || 1000;
  if (data.uid !== uid || data.gid !== gid) chownSync(dataDir, uid, gid);
  process.setgroups([gid]);
  process.setgid(gid);
  process.setuid(uid);
}

await import("./dist/main.js");
