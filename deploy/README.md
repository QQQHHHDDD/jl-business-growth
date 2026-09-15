# Deployment Templates

Production deployment uses Nginx and systemd, not Docker. Templates and release scripts belong in this directory tree and `scripts/`; they must never embed production credentials.

The Phase 0-6 implementation and V1 closeout provide release artifacts and
deployment templates, but do not perform production deployment. TLS, SMTP,
cloud systemd installation, backup/restore rehearsal, rollback rehearsal, and
production acceptance remain release-stage work after the Phase 7 test gate.
