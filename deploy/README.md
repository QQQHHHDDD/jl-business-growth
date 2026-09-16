# Deployment Templates

Production deployment uses Nginx and systemd, not Docker. Templates and release scripts belong in this directory tree and `scripts/`; they must never embed production credentials.

Build a production artifact with:

```bash
make release VERSION=v1.0.0
```

The artifact contains the Vite production bundle under `web/`, the Linux API and jobs binaries, migrations, and the backup script. Do not use `make dev` or expose port 5173 as a production service. Publish `web/` under the Nginx `root`, install the systemd templates, and use `scripts/deploy-prod.sh.example` only after the release-stage backup, migration, health-check, rollback, and UAT gates are complete.

The Phase 0-6 implementation and V1 closeout provide release artifacts and
deployment templates, but do not perform production deployment. TLS, SMTP,
cloud systemd installation, backup/restore rehearsal, rollback rehearsal, and
production acceptance remain release-stage work after the Phase 7 test gate.
