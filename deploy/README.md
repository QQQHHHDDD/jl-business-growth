# Deployment Templates

Production deployment uses Nginx and systemd, not Docker. Templates and release
scripts must never embed production credentials.

The database must be PostgreSQL 13 or newer with the `pg_trgm` extension
available. The application does not require `pgcrypto`, and PostgreSQL does not
need to be built with `--with-ssl=openssl` for application migrations.

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

Installed application releases and the `current` symlinks are provisioned as
`root:root`. The application user `jl-business` may read and execute backend
releases and read web releases, but must not write release directories or
replace either `current` symlink. Deployment first uploads to a staging
directory, then uses root/sudo to copy the immutable release, set ownership and
permissions, verify that no file or directory is writable by `jl-business`, and
switch the symlinks.

## Optional online updater

Online update remains disabled until an operator explicitly sets
`RELEASE_UPDATE_ENABLED=true`. Before enabling it:

1. Install `scripts/release-updater.sh` as
   `/usr/local/libexec/jl-business-release-updater`, owned by root and not
   writable by the application account.
2. Provision the permission-separated runtime layout:

```bash
test ! -L /var/lib/jl-business-growth/release-updater
sudo install -d -o root -g jl-business -m 0750 \
  /var/lib/jl-business-growth/release-updater
for directory in requests state work; do
  test ! -L "/var/lib/jl-business-growth/release-updater/${directory}"
done
sudo install -d -o root -g jl-business -m 0770 \
  /var/lib/jl-business-growth/release-updater/requests
sudo install -d -o root -g jl-business -m 0750 \
  /var/lib/jl-business-growth/release-updater/state
sudo install -d -o root -g root -m 0700 \
  /var/lib/jl-business-growth/release-updater/work
```

The runtime root and all four directories must be real directories, never
symlinks. The updater validates their owner, group, and exact mode at startup
and fails closed; production startup does not chmod or chown these paths.

Provision the backup destination before starting the backup service:

```bash
test ! -L /var/backups/jl-business-growth
sudo install -d -o jl-business -g jl-business -m 0700 \
  /var/backups/jl-business-growth
test -x /usr/bin/goose
```

The backup directory must already exist and be writable by the
`jl-business-backup.service` account; the migration helper requires the fixed
`/usr/bin/goose` executable before it can run.

```text
/var/lib/jl-business-growth/release-updater          root:jl-business 0750
/var/lib/jl-business-growth/release-updater/requests root:jl-business 0770
/var/lib/jl-business-growth/release-updater/state    root:jl-business 0750
/var/lib/jl-business-growth/release-updater/work     root:root         0700
```

The API can write only `requests/` (including the final atomic
`requests/request.json` trigger and its enqueue lock). The root updater writes
authoritative `state/status.json` and keeps its runner lock, claims, and
temporary work under `work/`.
The API unit marks its requests `ReadWritePaths` entry optional, so
`RELEASE_UPDATE_ENABLED=false` remains startable before this runtime layout is
provisioned.
3. Install `deploy/systemd/jl-business-updater.service` and
   `deploy/systemd/jl-business-updater.path`.
   Production `RELEASE_RUNTIME_ROOT` must remain exactly
   `/var/lib/jl-business-growth/release-updater`, matching the path unit's
   `PathExists` trigger at `requests/request.json`.
4. Install the trusted root-only helpers during a trusted deployment:

```bash
sudo install -o root -g root -m 0755 \
  scripts/release-updater.sh \
  /usr/local/libexec/jl-business-release-updater

sudo install -o root -g root -m 0755 \
  scripts/backup-db.sh \
  /usr/local/libexec/jl-business-backup-db

sudo install -o root -g root -m 0755 \
  scripts/jl-business-migrate-release \
  /usr/local/libexec/jl-business-migrate-release
```

   These `/usr/local/libexec` files are not automatically updated by the
   application account. Updater/helper security updates require explicit root
   provisioning during a trusted deployment. The updater never executes a
   backup script from an application-controlled release directory.
5. Configure `/etc/jl-business-growth/jl-business-growth.env` as a real,
   non-symlink, root-owned `EnvironmentFile` that is not group/other writable;
   `/etc/jl-business-growth` must also not be group/other writable. It is used
   by the API, updater, backup service, and migration helper. Deployment
   operators must not export `DATABASE_URL` in the SSH session. The deployment
   template starts `jl-business-backup.service` and invokes the root-provisioned
   migration helper with only a strict `vX.Y.Z` argument; the helper reads the
   fixed environment file and runs only Goose v3.25.0 `up` with
   `GOOSE_DRIVER=postgres` and `GOOSE_DBSTRING` against
   `/opt/jl-business-growth/releases/<version>/migrations`, using fixed
   `/usr/bin/goose` (forward-only; no `down` migration).
6. Ensure `curl`, `flock`, `jq`, `sha256sum`, `tar`, `pg_dump`, `psql`, `goose`,
   `stat`, and `readlink` are available to the updater service.
7. Enable the path unit only after backup and restore rehearsal:

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
The deployment template creates a random `mktemp -d` staging directory under
`/var/tmp`, verifies it is a deploy-user-owned `0700` real directory before
root copy, and removes it on both success and failure paths.

## Production online-updater bootstrap/runbook

This is a one-time preparation checklist for a host that will later use
Version Center online updates. It is intentionally generic: replace only the
trusted local PostgreSQL binary directory and other explicitly marked local
provisioning inputs. Do not put passwords, tokens, database URLs, or host
specific secrets in this repository.

1. Create the dedicated runtime identity. Do not use a panel account such as
   `www` for the API or jobs:

   ```bash
   getent group jl-business >/dev/null || sudo groupadd --system jl-business
   id jl-business >/dev/null 2>&1 || sudo useradd --system --gid jl-business \
     --home-dir /var/lib/jl-business-growth --shell /usr/sbin/nologin \
     --no-create-home jl-business
   ```

2. Provision the runtime directories with the ownership and modes shown above.
   Reject any existing symlink before running `install -d`. Provision
   `/var/lib/jl-business-growth/files` and `tmp` for the API as real
   `jl-business:jl-business` directories, and keep release roots and `current`
   symlinks `root:root` and immutable to the application account.

3. Provision `/etc/jl-business-growth/jl-business-growth.env` as a real,
   non-symlink, root-owned file with mode `0640` or stricter; its parent must
   also be root-owned and not group/other writable. Set production values
   there, including:

   ```text
   APP_ENV=production
   LISTEN_ADDR=127.0.0.1:8081
   RELEASE_API_HEALTH=http://127.0.0.1:8081/api/health
   RELEASE_UPDATE_ENABLED=false
   ```

   Keep `DATABASE_URL` and all credentials in that root-only provisioned file;
   never export them into an SSH deploy session. `DATABASE_URL` is consumed by
   the Go application and Goose through `GOOSE_DBSTRING`; `psql` and `pg_dump`
   use the separately provisioned libpq variables (`PGSERVICE` or `PGHOST`,
   `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSSLMODE`, and any required password
   mechanism) instead. The database URL, password, and conninfo must never be
   command-line arguments, and `PGPASSWORD` must never be printed or logged.

4. Provision a separate trusted CLI environment file at
   `/etc/jl-business-growth/jl-business-growth-cli.env`, owned by root and not
   group/other writable. Set `PATH` to the verified absolute PostgreSQL binary
   directory followed by standard system directories, for example:

   ```text
   PATH=/trusted/postgresql/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
   ```

   Replace `/trusted/postgresql/bin` during host provisioning with the actual
   trusted directory; do not change application source for a panel-specific
   path. This PATH file is separate from PostgreSQL connection credentials;
   do not put `DATABASE_URL`, `PGPASSWORD`, or other secrets in it. The updater
   and backup units load this optional file and must pass
   `command -v psql`, `command -v pg_dump`, `psql --version`, and
   `pg_dump --version` checks as `jl-business`. The fixed `/usr/bin/goose` and
   root-only helper paths remain unchanged.

5. Install the trusted root-only helpers under `/usr/local/libexec/` before any
   backup, migration, or updater rehearsal. Verify each helper is a real,
   non-symlink regular file owned by `root:root`, mode `0755`, and not writable
   by the application account:

   ```text
   /usr/local/libexec/jl-business-release-updater
   /usr/local/libexec/jl-business-backup-db
   /usr/local/libexec/jl-business-migrate-release
   ```

6. Install the API, jobs, backup, updater, timer, and path units as root and run
   `systemctl daemon-reload`. Perform static and startup preflight checks for
   unit contents, executable paths, EnvironmentFiles, directory ownership,
   CLI availability, and port configuration. Do not start the systemd API yet;
   do not enable either timer or `jl-business-updater.path` yet, and keep
   `RELEASE_UPDATE_ENABLED=false`. `After=postgresql.service` is only an
   ordering hint; these units do not require PostgreSQL to be managed by
   systemd.

7. Configure and validate Nginx with the example topology: static root
   `/var/www/jl-business-growth/current` and API proxy `127.0.0.1:8081`.
   `current` must remain a root-owned symlink; Nginx is read-only and the
   updater changes only that symlink. Configure
   `/.well-known/acme-challenge/` using a separate production-managed
   location/alias outside the application release directory; ACME must not
   depend on a release's `web/` contents. Run the Nginx configuration test
   before reload and preserve the current known-good configuration for rapid
   rollback.

8. Prepare the short-downtime API cutover. Record the configuration and exact
   start/stop procedure for only the existing JL Supervisor project so it can
   be restored quickly. Capture the pre-cutover public health result and verify
   the unrelated service on `127.0.0.1:8080` is healthy. Do not stop, restart,
   reconfigure, or otherwise operate that 8080 service.

9. Stop only the old `jl-business-api` Supervisor project, confirm
   `127.0.0.1:8081` has been released, and reconfirm the 8080 service is still
   running. Immediately start `jl-business-api.service`, then check all of:

   - `systemctl status jl-business-api.service`;
   - `http://127.0.0.1:8081/api/health/live`;
   - `http://127.0.0.1:8081/api/health/ready`;
   - the public API health endpoint through Nginx.

   If systemd startup or any health check fails, stop
   `jl-business-api.service`, restart the recorded JL Supervisor project, and
   verify both 8081 and public health again. Disable or remove the JL
   Supervisor auto-start entry only after the systemd API passes every check.
   Never operate the unrelated 8080 service during this cutover.

10. With both timers still disabled, perform a real backup rehearsal using
    `systemctl start jl-business-backup.service`, verify the oneshot exit
    status is zero, and verify both database and file backup artifacts. Do not
    treat a stale unit status as proof of the current start.

11. Validate the already-installed root-only migration helper, fixed
    `/usr/bin/goose`, trusted release migration directory, and `goose validate`
    output. Migration rehearsal must use an approved isolated non-production
    database; never use a production database for a test. Production migration
    remains forward-only.

12. Manually start and validate `jl-business-jobs.service`. Only after both the
    manual jobs check and the backup rehearsal succeed, enable
    `jl-business-jobs.timer` and `jl-business-backup.timer`. Keep
    `jl-business-updater.path` disabled and `RELEASE_UPDATE_ENABLED=false`.

13. Rehearse updater and rollback with the already-installed helpers and a
    disposable release fixture in an isolated non-production rehearsal
    environment: backup must complete before migration, API/jobs restart must
    use systemd, health checks must use `RELEASE_API_HEALTH`, and failed
    health/switch conditions must restore only when every restore check
    succeeds. Confirm request, lock, status, ownership, and immutable release
    boundaries. Production `RELEASE_UPDATE_ENABLED` remains false throughout
    this rehearsal.

14. After every updater and rollback rehearsal gate passes, enable
    `jl-business-updater.path` and verify the path unit is active and watches
    the fixed request path. Do not submit a production update request and do
    not change `RELEASE_UPDATE_ENABLED` yet.

15. Before enabling online updates, confirm the independent `127.0.0.1:8080`
    service is healthy and unaffected, the API is healthy on `127.0.0.1:8081`,
    Nginx serves `current`, backup and migration checks passed, and rollback
    rehearsal evidence is recorded.

16. Only as the final change, set `RELEASE_UPDATE_ENABLED=true` in the trusted
    environment file and restart the systemd API. Confirm Version Center can
    check releases, submit one controlled request, and observe the authoritative
    updater status and health checks. Never enable this setting in a release
    artifact or API request.

17. Emergency disable procedure: set `RELEASE_UPDATE_ENABLED=false`, restart
    `jl-business-api.service`, disable `jl-business-updater.path`, and stop a
    currently running updater only after checking its status and backup/migration
    state. Preserve the immutable release and status files for investigation.
