#!/usr/bin/env python3
"""Convert Manga Nest JSON metadata backups into the SQLite backup layout.

Usage:
  python scripts/convert-legacy-backup.py /path/to/old-backup
  python scripts/convert-legacy-backup.py /path/to/old-backup -o /path/to/output

The output contains:
  output/manga/<uid>/<episode>/<page files>
  output/SQLite/library.db
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCHEMA = """
PRAGMA foreign_keys = ON;
CREATE TABLE manga (
  uid TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  author TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL,
  added_at TEXT NOT NULL,
  title_page_ep TEXT,
  title_page_num INTEGER
);
CREATE TABLE chapters (
  uid TEXT NOT NULL REFERENCES manga(uid) ON DELETE CASCADE,
  ep TEXT NOT NULL,
  pages INTEGER NOT NULL DEFAULT 0,
  saved_at TEXT NOT NULL,
  PRIMARY KEY (uid, ep)
);
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE
);
CREATE TABLE genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE
);
CREATE TABLE manga_tags (
  uid TEXT NOT NULL REFERENCES manga(uid) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (uid, tag_id)
);
CREATE TABLE manga_genres (
  uid TEXT NOT NULL REFERENCES manga(uid) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (uid, genre_id)
);
CREATE INDEX chapters_uid_idx ON chapters(uid);
"""


def read_json(path: Path, fallback: dict[str, Any] | None = None) -> dict[str, Any]:
    if not path.is_file():
        return fallback or {}
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else (fallback or {})
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"Could not read JSON: {path}: {exc}") from exc


def text(value: Any, default: str = "") -> str:
    return value if isinstance(value, str) else default


def values(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result = []
    for item in value:
        if isinstance(item, str) and item.strip():
            result.append(item.strip())
        elif isinstance(item, dict):
            name = item.get("name") or item.get("label")
            if isinstance(name, str) and name.strip():
                result.append(name.strip())
    return result


def key(value: str) -> str:
    return value.strip().lower()


def find_manga_root(source: Path) -> Path:
    if (source / "manga").is_dir():
        return source / "manga"
    return source


def insert_relation(
    db: sqlite3.Connection, table: str, join_table: str, uid: str, names: list[str]
) -> None:
    for name in names:
        normalized = key(name)
        db.execute(
            f"INSERT INTO {table} (name, name_key) VALUES (?, ?) "
            "ON CONFLICT(name_key) DO UPDATE SET name = excluded.name",
            (name, normalized),
        )
        row = db.execute(
            f"SELECT id FROM {table} WHERE name_key = ?", (normalized,)
        ).fetchone()
        if row is None:
            raise RuntimeError(f"Could not create {table} relation for {name!r}")
        db.execute(
            f"INSERT OR IGNORE INTO {join_table} (uid, {table[:-1]}_id) VALUES (?, ?)",
            (uid, row[0]),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, help="Old backup folder")
    parser.add_argument("-o", "--output", type=Path, help="Output backup folder")
    args = parser.parse_args()

    source = args.source.expanduser().resolve()
    if not source.is_dir():
        raise SystemExit(f"Source folder does not exist: {source}")

    manga_root = find_manga_root(source)
    uid_dirs = [path for path in manga_root.iterdir() if path.is_dir()]
    if not uid_dirs:
        raise SystemExit(f"No manga folders found in: {manga_root}")

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    output = (
        args.output.expanduser().resolve()
        if args.output
        else source.parent / f"backup_manga_nest_converted_{stamp}"
    )
    if output.exists():
        raise SystemExit(f"Output already exists: {output}")

    output_manga = output / "manga"
    output_db = output / "SQLite" / "library.db"
    output_manga.mkdir(parents=True)
    output_db.parent.mkdir(parents=True)

    index_path = manga_root / "index.json"
    index_value: Any = {}
    if index_path.is_file():
        try:
            index_value = json.loads(index_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            raise SystemExit(f"Could not read JSON: {index_path}: {exc}") from exc
    index_items = (
        index_value.get("manga", [])
        if isinstance(index_value, dict)
        else index_value
        if isinstance(index_value, list)
        else []
    )
    index_entries = {
        str(entry["uid"]): entry
        for entry in index_items
        if isinstance(entry, dict) and entry.get("uid")
    }

    db = sqlite3.connect(output_db)
    try:
        db.executescript(SCHEMA)
        converted = 0

        for uid_dir in uid_dirs:
            uid = uid_dir.name
            if uid in {"SQLite", "manga"}:
                continue
            indexed = index_entries.get(uid, {})
            title = read_json(uid_dir / "title.json", indexed)
            name = text(title.get("name"), text(indexed.get("name"), uid))
            author = text(title.get("author"), text(indexed.get("author")))
            source_name = text(title.get("source"), text(indexed.get("source"), "local"))
            added_at = text(
                title.get("addedAt"), text(indexed.get("addedAt"), datetime.now(timezone.utc).isoformat())
            )

            db.execute(
                """INSERT INTO manga
                   (uid, name, name_key, author, source, added_at, title_page_ep, title_page_num)
                   VALUES (?, ?, ?, ?, ?, ?, NULL, NULL)""",
                (uid, name, key(name), author, source_name, added_at),
            )
            insert_relation(db, "tags", "manga_tags", uid, values(title.get("tags")))
            insert_relation(db, "genres", "manga_genres", uid, values(title.get("genres")))

            destination_uid = output_manga / uid
            for child in uid_dir.iterdir():
                if child.name in {"title.json", "index.json"}:
                    continue
                if child.is_dir():
                    destination = destination_uid / child.name
                    shutil.copytree(child, destination)
                    info = read_json(child / "info.json")
                    ep = text(info.get("ep"), child.name)
                    pages = info.get("pages", 0)
                    pages = pages if isinstance(pages, int) else 0
                    saved_at = text(info.get("savedAt"), added_at)
                    db.execute(
                        "INSERT OR REPLACE INTO chapters (uid, ep, pages, saved_at) VALUES (?, ?, ?, ?)",
                        (uid, ep, pages, saved_at),
                    )
                    copied_info = destination / "info.json"
                    if copied_info.exists():
                        copied_info.unlink()
            converted += 1

        db.commit()
        (output / ".nomedia").touch()
        print(f"Converted {converted} manga folder(s).")
        print(f"Created backup: {output}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
