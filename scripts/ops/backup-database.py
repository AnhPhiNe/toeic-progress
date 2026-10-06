"""Create a PostgreSQL custom archive without putting credentials in command arguments or logs."""

import argparse
import os
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=".backups")
    args = parser.parse_args()
    required = ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD")
    if any(not os.environ.get(name) for name in required):
        raise SystemExit(
            "Configure PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD privately before creating a backup."
        )
    if not shutil.which("pg_dump") or not shutil.which("pg_restore"):
        raise SystemExit(
            "Install PostgreSQL client tools (matching the server major version) first."
        )
    destination = Path(args.output_dir).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    archive = destination / f"toeic-{stamp}.dump"
    environment = {
        **os.environ,
        "PGSSLMODE": os.environ.get("PGSSLMODE", "verify-full"),
        "PGCONNECT_TIMEOUT": "15",
    }
    # Exclusive creation prevents overwriting an existing backup. Restrict POSIX permissions.
    with archive.open("xb") as stream:
        os.chmod(archive, 0o600)
        result = subprocess.run(
            ["pg_dump", "--format=custom", "--no-password"],
            env=environment,
            stdout=stream,
            stderr=subprocess.PIPE,
            check=False,
        )
    if result.returncode:
        archive.unlink()
        raise SystemExit(
            "Backup failed. Check PostgreSQL version, connection settings and SSL certificate configuration."
        )
    inspected = subprocess.run(
        ["pg_restore", "--list", str(archive)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        check=False,
    )
    if inspected.returncode or archive.stat().st_size == 0:
        archive.unlink()
        raise SystemExit("Backup archive validation failed.")
    print(f"Backup saved: {archive}")
    print(
        "Archive structure checked. Test restoring to a separate staging database before relying on this backup."
    )


if __name__ == "__main__":
    main()
