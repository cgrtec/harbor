import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  console.log("[mpv] not Windows, skipping bundled mpv.exe");
  process.exit(0);
}

// Pinned release + checksums, verified 2026-10-10. shinchiro rotates and prunes releases
// (the previous 20260610 pin started returning 404), so when the pinned asset is gone the
// script falls back to the newest release resolved through the GitHub API, still verifying
// the sha256 (for the fallback, against the digest the API reports for the asset).
const PINNED = {
  release: "20261010",
  x64: {
    asset: "mpv-x86_64-20261010-git-b2c255c13e.7z",
    sha256: "70a568c046a10f0b365319c4ec5382d8fb37f509615944b7e9932b66e5ccfb25",
  },
  arm64: {
    asset: "mpv-aarch64-20261010-git-b2c255c13e.7z",
    sha256: "c3aabf7bcc2c7b1350b46571e992437d53164a7f11ff54010d8715a913c80f2f",
  },
};
const MPV_ARCH = { x64: "x86_64", arm64: "aarch64" }[process.arch];
if (!MPV_ARCH) throw new Error(`[mpv] unsupported Windows architecture: ${process.arch}`);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const destination = join(root, "src-tauri", "binaries", "mpv-x86_64-pc-windows-msvc.exe");

if (existsSync(destination) && statSync(destination).size > 0) {
  console.log(`[mpv] ${destination} already present`);
  process.exit(0);
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function download(url) {
  console.log(`[mpv] fetching ${url}`);
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) return { status: response.status, buf: null };
  return { status: response.status, buf: Buffer.from(await response.arrayBuffer()) };
}

async function resolveFromPinned() {
  const spec = PINNED[process.arch];
  const url = `https://github.com/shinchiro/mpv-winbuild-cmake/releases/download/${PINNED.release}/${spec.asset}`;
  const { status, buf } = await download(url);
  if (status !== 200) {
    console.log(`[mpv] pinned release unavailable (HTTP ${status}); falling back to the newest release`);
    return null;
  }
  const got = sha256(buf);
  if (got !== spec.sha256) {
    console.log(`[mpv] pinned asset changed (sha256 ${got}); falling back to the newest release`);
    return null;
  }
  return { name: spec.asset, buf };
}

async function resolveFromLatest() {
  const api = "https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest";
  const res = await fetch(api, {
    headers: { "User-Agent": "harbor-ci", Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`[mpv] cannot resolve latest release (${res.status} ${res.statusText})`);
  const release = await res.json();
  const pattern = new RegExp(`^mpv-${MPV_ARCH}-\\d{8}-git-[0-9a-f]+\\.7z$`);
  const asset = (release.assets ?? []).find((a) => pattern.test(a.name));
  if (!asset) throw new Error(`[mpv] no ${MPV_ARCH} asset in release ${release.tag_name}`);
  const { status, buf } = await download(asset.browser_download_url);
  if (status !== 200) throw new Error(`[mpv] download failed (HTTP ${status}) for ${asset.name}`);
  const expected = String(asset.digest ?? "").replace(/^sha256:/, "");
  if (expected && sha256(buf) !== expected) {
    throw new Error("[mpv] checksum mismatch against the API digest");
  }
  if (!expected) console.log("[mpv] warning: asset carries no digest; the extracted mpv.exe is validated downstream");
  console.log(`[mpv] using fallback release ${release.tag_name}: ${asset.name}`);
  return { name: asset.name, buf };
}

function findFile(dir, name) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findFile(path, name);
      if (found) return found;
    } else if (entry.name === name) {
      return path;
    }
  }
  return null;
}

const temp = mkdtempSync(join(tmpdir(), "harbor-mpv-"));

try {
  const resolved = (await resolveFromPinned()) ?? (await resolveFromLatest());

  const archive = join(temp, resolved.name);
  writeFileSync(archive, resolved.buf);

  const extracted = join(temp, "extracted");
  mkdirSync(extracted);
  try {
    execFileSync("7z", ["x", "-y", archive, `-o${extracted}`], { stdio: "inherit" });
  } catch {
    throw new Error("[mpv] extraction failed; install 7-Zip and ensure `7z` is on PATH");
  }

  const mpv = findFile(extracted, "mpv.exe");
  if (!mpv) throw new Error("[mpv] mpv.exe was not found in the archive");
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(mpv, destination);
  console.log(`[mpv] wrote ${destination}`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
