import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest

spec = importlib.util.spec_from_file_location(
    "backup_script", Path(__file__).resolve().parents[2] / "scripts/ops/backup-database.py"
)
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


def prepare(monkeypatch, tmp_path):
    monkeypatch.setattr("sys.argv", ["backup-database.py", "--output-dir", str(tmp_path)])
    for key, value in {
        "PGHOST": "db.example",
        "PGPORT": "5432",
        "PGDATABASE": "postgres",
        "PGUSER": "operator",
        "PGPASSWORD": "test-password-secret",
    }.items():
        monkeypatch.setenv(key, value)
    monkeypatch.setattr(backup.shutil, "which", lambda name: name)


def test_backup_uses_private_environment_and_checks_archive(monkeypatch, tmp_path, capsys):
    prepare(monkeypatch, tmp_path)
    commands = []

    def run(command, **options):
        commands.append(command)
        if command[0] == "pg_dump":
            assert options["env"]["PGPASSWORD"] == "test-password-secret"
            assert options["env"]["PGSSLMODE"] == "verify-full"
            options["stdout"].write(b"custom-archive")
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(backup.subprocess, "run", run)
    backup.main()
    assert len(list(tmp_path.glob("*.dump"))) == 1
    assert commands[0] == ["pg_dump", "--format=custom", "--no-password"]
    assert commands[1][:2] == ["pg_restore", "--list"]
    assert "test-password-secret" not in str(commands) + capsys.readouterr().out


def test_failed_backup_removes_partial_archive_and_hides_upstream_error(monkeypatch, tmp_path, capsys):
    prepare(monkeypatch, tmp_path)
    monkeypatch.setattr(backup.subprocess, "run", lambda *_args, **_kwargs: SimpleNamespace(returncode=1))
    with pytest.raises(SystemExit, match="Backup failed"):
        backup.main()
    assert list(tmp_path.glob("*.dump")) == []
    assert "test-password-secret" not in capsys.readouterr().out
