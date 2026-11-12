#!/usr/bin/env python3
"""One-off data migration: DO managed Postgres -> Neon (no pg_dump).

Schema on target must already exist (borter Migratus creates it on deploy).
Streams each table SOURCE -> TARGET with COPY TO STDOUT CSV -> COPY FROM STDIN
in FK-safe order, preserving timestamps verbatim, then resets sequences.

Usage:
    ssh -fN -L 15433:<do-db-host>:25061 root@<droplet>   # DO is firewall-locked
    SOURCE_DATABASE_URL=postgres://...@127.0.0.1:15433/PRODUCTION \
    TARGET_DATABASE_URL="neon connection-string" \
    python3 scripts/migrate-to-fly.py
"""
import io
import os
import sys

import psycopg2

# Parent-first order observed from borter/resources/migrations/*.up.sql.
# Never copy `migrations` (target Migratus tracks its own state).
TABLES = [
    "users",
    "groups",
    "roles",
    "users_in_groups",
    "items",
    "attributes",
    "votes",
    "tags",
    "items_in_tags",
    "tokens",
    "skipped",
    "comments",
    "usergroups",
    "users_in_usergroups",
    "api_keys",
    "linked_accounts",
    "email_confirmations",
    "password_reset_tokens",
    "perms",
]

# Tables with a SERIAL `id` sequence (users has PK user_name varchar).
SEQUENCES = {
    "groups": "groups_id_seq",
    "roles": "roles_id_seq",
    "items": "items_id_seq",
    "attributes": "attributes_id_seq",
    "votes": "votes_id_seq",
    "tags": "tags_id_seq",
    "tokens": "tokens_id_seq",
    "comments": "comments_id_seq",
    "usergroups": "usergroups_id_seq",
    "api_keys": "api_keys_id_seq",
    "linked_accounts": "linked_accounts_id_seq",
    "perms": "perms_id_seq",
}


def columns(cur, table):
    cur.execute(
        """
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = %s
        ORDER BY ordinal_position
        """,
        (table,),
    )
    return [r[0] for r in cur.fetchall()]


def migrate(src, dst):
    s = psycopg2.connect(src)
    d = psycopg2.connect(dst)
    s_cur = s.cursor()
    d_cur = d.cursor()
    ok = True
    try:
        # Target holds only Migratus seed rows; clear so COPY is verbatim.
        existing = [t for t in TABLES if columns(d_cur, t)]
        d_cur.execute(
            f"TRUNCATE {', '.join(existing)} RESTART IDENTITY CASCADE"
        )
        d.commit()
        for table in TABLES:
            cols = columns(d_cur, table)
            if not cols:
                print(f"skip {table}: no such table on target")
                continue
            buf = io.StringIO()
            s_cur.copy_expert(
                f"COPY (SELECT {', '.join(cols)} FROM {table}) TO STDOUT CSV", buf
            )
            buf.seek(0)
            d_cur.copy_expert(f"COPY {table} ({', '.join(cols)}) FROM STDIN CSV", buf)
            d.commit()
            # Verify count matches source.
            s_cur.execute(f"SELECT count(*) FROM {table}")
            n_src = s_cur.fetchone()[0]
            d_cur.execute(f"SELECT count(*) FROM {table}")
            n_dst = d_cur.fetchone()[0]
            mark = "OK" if n_src == n_dst else "MISMATCH"
            if n_src != n_dst:
                ok = False
            print(f"{mark} {table}: source={n_src} target={n_dst}")
        # Reset sequence maxima for SERIAL tables.
        for table, seq in SEQUENCES.items():
            try:
                d_cur.execute(
                    f"SELECT setval('public.{seq}', (SELECT max(id) FROM {table}))"
                )
                print(f"sequence {seq} reset")
            except Exception as e:
                d.rollback()
                print(f"sequence {seq} skipped ({e})")
        d.commit()
    finally:
        s.close()
        d.close()
    return ok


def main():
    src = os.environ.get("SOURCE_DATABASE_URL")
    dst = os.environ.get("TARGET_DATABASE_URL")
    if not src or not dst:
        raise SystemExit("SOURCE_DATABASE_URL and TARGET_DATABASE_URL required")
    if not migrate(src, dst):
        raise SystemExit("migration finished with count mismatches")
    print("migration complete")


if __name__ == "__main__":
    main()
