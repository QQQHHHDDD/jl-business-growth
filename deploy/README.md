# Deployment Templates

Production deployment uses Nginx and systemd, not Docker. Templates and release
scripts must never embed production credentials.

Build an immutable Linux release artifact with:

```bash
make release VERSION=v1.2.3
```

The build creates:

- `.local/release/v1.2.3/`, containing binaries, `web/`, migrations, scripts,
  and `release.json`;
- `.local/release/jl-business-growth_v1.2.3_linux_amd64.tar.gz`;
- `.local/release/SHA256SUMS`.

The installed release layout remains:

```text
/opt/jl-business-growth/releases/<version>
/opt/jl-business-growth/current
/var/www/jl-business-growth/releases/<version>
/var/www/jl-business-growth/current
```

## Optional online updater

Online update remains disabled until an operator explicitly sets
`RELEASE_UPDATE_ENABLED=true`. Before enabling it:

1. Install `scripts/release-updater.sh` as
   `/usr/local/libexec/jl-business-release-updater`, owned by root and not
   writable by the application account.
2. Create `/var/lib/jl-business-growth/release-updater` owned by
   `root:jl-business` with mode `0770`.
3. Install `deploy/systemd/jl-business-updater.service` and
   `deploy/systemd/jl-business-updater.path`.
   Production `RELEASE_RUNTIME_ROOT` must remain exactly
   `/var/lib/jl-business-growth/release-updater`, matching the path unit's
   `PathExists` trigger.
4. Ensure `curl`, `flock`, `jq`, `sha256sum`, `tar`, `pg_dump`, `psql`, and
   `goose` are available to the updater service.
5. Configure the production environment file without exposing it to the web
   process or release artifacts.
6. Enable the path unit only after backup and restore rehearsal:

```bash
sudo systemctl enable --now jl-business-updater.path
```

The API only validates and writes a fixed request under `/var/lib`. The
independent updater downloads assets from the fixed GitHub repository, verifies
SHA256 and `release.json`, backs up the database, applies only `goose up`,
switches both symlinks, restarts services, and performs live and ready health
checks. It never performs a production down migration.

Use `scripts/deploy-prod.sh.example` only after release-stage backup, migration,
health-check, rollback, and acceptance gates are complete. See
[release management](../docs/release-management.md) for the full safety model.
