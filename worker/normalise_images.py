"""Rename uploaded logos and map images to what the site looks for.

    python normalise_images.py [--apply]

Images arrive named however they were saved: an accent dropped, an underscore
instead of a hyphen, a WebP called .jpg, sometimes no extension at all. The
site looks them up by exact slug, so a near-miss is simply a missing image.

This matches each file to a team slug or map name, detects the real format
from its magic bytes rather than trusting the extension, and renames it.
Without --apply it only reports what it would do.
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOGOS = os.path.join(ROOT, "web", "public", "logos")
MAPS = os.path.join(ROOT, "web", "public", "maps")

# Magic bytes, because the extension is the thing that is wrong.
SIGNATURES = [
    (b"\x89PNG\r\n\x1a\n", ".png"),
    (b"\xff\xd8\xff", ".jpg"),
    (b"GIF87a", ".gif"),
    (b"GIF89a", ".gif"),
]


def detect(path: str) -> str | None:
    with open(path, "rb") as fh:
        head = fh.read(16)
    for magic, ext in SIGNATURES:
        if head.startswith(magic):
            return ext
    # RIFF....WEBP - the length sits between the two markers.
    if head.startswith(b"RIFF") and head[8:12] == b"WEBP":
        return ".webp"
    if head.lstrip()[:5] in (b"<?xml", b"<svg "):
        return ".svg"
    return None


def key(name: str) -> str:
    """Fold a filename to the form a slug takes, for matching."""
    stem = os.path.splitext(name)[0]
    folded = unicodedata.normalize("NFKD", stem)
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    folded = folded.replace("ø", "o").replace("Ø", "O")
    return re.sub(r"[^a-z0-9]+", "", folded.lower())


def plan(directory: str, wanted: dict[str, str]) -> list[tuple[str, str, str]]:
    """(current name, new name, note) for every file in the directory.

    `wanted` maps a folded key to the canonical stem the site wants.
    """
    if not os.path.isdir(directory):
        return []
    out = []
    for name in sorted(os.listdir(directory)):
        if name.lower().endswith(".md"):
            continue
        path = os.path.join(directory, name)
        if not os.path.isfile(path):
            continue

        ext = detect(path)
        if ext is None:
            out.append((name, "", "ukjent bildeformat - hopper over"))
            continue

        folded = key(name)
        target = wanted.get(folded)
        if target is None:
            # A near miss: one stem contained in the other, which covers
            # "frogn-kommune-cs2" against "frogn-kommune-cs".
            matches = [v for k, v in wanted.items()
                       if folded.startswith(k) or k.startswith(folded)]
            target = matches[0] if len(matches) == 1 else None

        if target is None:
            out.append((name, "", "matcher ingen lag eller kart"))
            continue

        new_name = f"{target}{ext}"
        if new_name == name:
            out.append((name, new_name, "allerede riktig"))
        else:
            out.append((name, new_name, "gir nytt navn"))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="actually rename")
    ap.add_argument("--league", default=os.path.join(ROOT, "data", "league.json"))
    args = ap.parse_args()

    league = json.load(io.open(args.league, encoding="utf-8"))
    teams = {key(t["slug"]): t["slug"] for t in league["teams"]}
    maps: dict[str, str] = {}
    for team in league["teams"]:
        for map_name in team["maps"]:
            short = map_name.removeprefix("de_")
            maps[key(short)] = short

    for label, directory, wanted in (("logoer", LOGOS, teams), ("kart", MAPS, maps)):
        print(f"=== {label} ({directory}) ===")
        actions = plan(directory, wanted)
        if not actions:
            print("   ingen filer")
        for name, new_name, note in actions:
            arrow = f" -> {new_name}" if new_name and new_name != name else ""
            print(f"   {name}{arrow}   [{note}]")
            if args.apply and note == "gir nytt navn":
                os.replace(os.path.join(directory, name),
                           os.path.join(directory, new_name))
        print()

    missing = [t["slug"] for t in league["teams"]
               if not any(f.startswith(t["slug"] + ".")
                          for f in (os.listdir(LOGOS) if os.path.isdir(LOGOS) else []))]
    if missing:
        print("lag uten logo:", ", ".join(missing))
    if not args.apply:
        print("\n(tørrkjøring - kjør med --apply for å gjøre endringene)")


if __name__ == "__main__":
    main()
