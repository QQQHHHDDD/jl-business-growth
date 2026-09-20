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
   operators must not export `DATABASE_URL` in the SSH
   session. The deployment template starts `jl-business-backup.service` and
   invokes the root-provisioned migration helper with only a strict `vX.Y.Z`
   argument; the helper reads the fixed environment file and runs only
   `goose up` against `/opt/jl-business-growth/releases/<version>/migrations`.
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
