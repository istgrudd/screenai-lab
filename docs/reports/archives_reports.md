# Archive Pipeline — Review & VPS Go-Live Checklist

Review of the `scripts/archive_period.py` implementation report.

## Verdict

Solid, honest, and well-tested given the dev constraints. Read-only, deletes
nothing, and matches the locked design (Excel report + foldered documents +
full-DB `pg_dump -Fc`, standalone on the VPS, manual pull). **Approved for VPS**
with the verifications below — the production dump path was never exercised
end-to-end in dev, so the first production run is the real acceptance test.

## Verified in dev

- Report + documents against the real SQLite dev DB (period 1): row-count
  assertions pass, 18/18 on-disk files copied, no misses.
- All four edge cases in an isolated sandbox (copied DB + uploads, real DB left
  pristine): no `Candidate` row → blank scores + row kept; incomplete documents →
  recorded in `missing_documents`; null IPK → blank cell; non-PDF KTM → copied
  verbatim as `KTM.jpg`.
- `local` dump mode end-to-end against a real Postgres 18: valid `-Fc` dump,
  `pg_restore --list` = 153 TOC entries.
- Default `docker` command string confirmed, plus the degraded exit-code-2 path
  (report + documents still written when the dump fails).
- Enum-rendering bug found and fixed (str-subclass enums slipping past an
  `isinstance(str)` guard → now checks `isinstance(enum.Enum)` first).

## Must verify on first VPS run (production = Postgres in Docker)

1. **Docker dump path, end-to-end.** Default
   `docker compose exec -T db pg_dump -Fc ...` has never produced a real dump in
   dev (daemon was down; only the command string + `local` mode were proven).
   On the first VPS run, confirm: exit code `0`,
   `manifest.db_snapshot.validated == true`, and a non-empty
   `pg_restore_toc_entry_count`.
2. **Re-run over an existing completed archive (Linux/POSIX).** POSIX will not
   `rename()` a directory over a non-empty target (`ENOTEMPTY`). Confirm a second
   run for the same period cleanly replaces `archive/{id}_{slug}/` instead of
   erroring on the rename — and that no window exists where both the old and new
   archive are lost. (Idempotency was claimed but the collision-with-existing-
   archive path may be untested.)
3. **IPK with a real value.** All three dev users had null IPK, so the populated
   IPK column was never rendered. Eyeball one row with a real IPK in the Postgres
   data.
4. **`python -m scripts.archive_period` resolves on the VPS.** Run from the repo
   root, with the backend importable and the **same `.env` the backend uses**, so
   `DATABASE_URL` and `POSTGRES_*` resolve.

## Notes / accepted

- `(deleted dimension #N)` fallback is a SQLite-dev artifact (FK enforcement off →
  orphaned `dimension_scores`). On Postgres, `DimensionScore.dimension_id`
  cascades, so orphans shouldn't occur — the label is defensive, likely dead code
  in production. Harmless; keep it.
- `pg_restore --list` validates that the archive TOC is readable and non-empty,
  **not** that a full data restore would succeed. Acceptable as a safety-net
  check. A true test-restore-into-scratch-DB is possible future hardening, not
  needed now.
- Exit code `2` (archive written, dump failed) is a good operational choice —
  keep it. Re-runs are idempotent, so the recovery flow is "fix Docker, re-run".
- Only two repo changes: `openpyxl>=3.1.0` in `requirements.txt` and `/archive/`
  in `.gitignore`.

## Out of scope (unchanged decisions)

- **Transfer:** lab pulls the whole folder manually via `rsync` over Tailscale.
  Not part of this script.
- **Purge of VPS source data** after a successful archive/pull: deferred to a
  separate discussion.