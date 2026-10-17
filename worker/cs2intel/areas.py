"""Map areas: bombsite resolution and world-to-radar coordinates.

CS2's nav format dropped the place names that CS:GO's `.nav` carried, and no
public dataset ships authoritative CS2 callouts, so this module deliberately
does not invent them. What it provides instead is grounded in two sources:

  * the demo's own `bomb_planted.site` field, which separates the bombsites
    authoritatively, and the plant coordinates that reveal where they are;
  * awpy's per-map radar calibration, which places any world coordinate on the
    official radar image.

The A/B naming is the one curated piece. It is a per-map reference point, kept
separate from everything measured, and every resolved site reports the observed
centroid next to the label so the naming can be checked against the radar
overlay at a glance.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import pandas as pd

from .extract import Match

# Curated reference points, in world coordinates, used only to attach the
# conventional "A"/"B" letter to an observed bombsite cluster. Nothing else
# depends on these numbers: if a map is missing here the sites still resolve,
# they just carry positional labels instead of letters.
SITE_REFERENCE_POINTS: dict[str, list[tuple[str, float, float]]] = {
    # Verified against observed plant clusters in a parsed demo of this map:
    # site 426 at (2088, 181) and site 81 at (~400, 2850) on de_inferno, both
    # within ~100 units of the points below.
    #
    # Add a map here only after checking a real demo's plant centroids against
    # the proposed point. Two cautions: a remake can move a site, and on maps
    # whose sites are stacked vertically (Nuke) a 2-D reference point cannot
    # separate them at all — that needs a Z term this table does not have.
    # Until a map is added, its sites resolve with positional labels, which
    # costs the letter and nothing else.
    "de_inferno": [("A", 2100.0, 250.0), ("B", 430.0, 2820.0)],
}


@dataclass
class Bombsite:
    """A bombsite as observed in this demo."""
    site_id: int            # the demo's bomb_planted.site entity index
    label: str              # "A"/"B" where known, else "site at (x, y)"
    label_source: str       # "curated_reference_point" | "positional_fallback"
    centroid_x: float       # mean of observed plant positions
    centroid_y: float
    plant_count: int
    radius: float           # distance covering every observed plant, plus margin

    def contains(self, x: float, y: float) -> bool:
        return math.dist((x, y), (self.centroid_x, self.centroid_y)) <= self.radius

    def distance(self, x: float, y: float) -> float:
        return math.dist((x, y), (self.centroid_x, self.centroid_y))


@dataclass
class RadarCalibration:
    """World-to-radar transform for one map, from awpy's map_data.json."""
    pos_x: float
    pos_y: float
    scale: float

    def to_normalised(self, x: float, y: float) -> tuple[float, float]:
        """World coordinates to 0-1 fractions of the radar image.

        Normalised rather than pixel coordinates so the web layer can render
        the radar at any size without re-deriving the transform.
        """
        px = (x - self.pos_x) / self.scale
        py = (self.pos_y - y) / self.scale
        return px / 1024.0, py / 1024.0


def load_calibration(map_name: str) -> RadarCalibration | None:
    """Radar calibration for a map, or None when awpy has no data for it."""
    try:
        import awpy.data as awpy_data
        entry = awpy_data.map_data().get(map_name)
    except Exception:
        return None
    if not entry or entry.get("scale") in (None, 0):
        return None
    return RadarCalibration(
        pos_x=float(entry["pos_x"]),
        pos_y=float(entry["pos_y"]),
        scale=float(entry["scale"]),
    )


# Margin added to the furthest observed plant so that positions on the edge of
# a site still register as being on it. A plant can only happen inside the
# bombsite trigger, so the observed spread understates the site's true extent.
SITE_RADIUS_MARGIN = 250.0
MIN_SITE_RADIUS = 400.0


def resolve_bombsites(match: Match, plants: pd.DataFrame) -> list[Bombsite]:
    """Group observed plants by the demo's site field and name the clusters.

    Requires at least one plant per site: a demo where a team never planted at
    a site cannot reveal where that site is, and this returns only what was
    observed rather than guessing the rest.
    """
    if len(plants) == 0 or "site" not in plants.columns:
        return []

    refs = SITE_REFERENCE_POINTS.get(match.map_name, [])
    used_labels: set[str] = set()
    sites: list[Bombsite] = []

    for site_id, grp in plants.groupby("site"):
        cx = float(grp["user_X"].mean())
        cy = float(grp["user_Y"].mean())
        spread = max(
            (math.dist((float(r.user_X), float(r.user_Y)), (cx, cy))
             for r in grp.itertuples(index=False)),
            default=0.0,
        )

        label, source = f"site at ({cx:.0f}, {cy:.0f})", "positional_fallback"
        candidates = [(math.dist((rx, ry), (cx, cy)), name)
                      for name, rx, ry in refs if name not in used_labels]
        if candidates:
            distance, name = min(candidates)
            # A reference point must actually be near the observed cluster;
            # otherwise the map layout has changed and the letter would be a
            # guess dressed up as data.
            if distance <= 1500.0:
                label, source = name, "curated_reference_point"
                used_labels.add(name)

        sites.append(Bombsite(
            site_id=int(site_id),
            label=label,
            label_source=source,
            centroid_x=cx,
            centroid_y=cy,
            plant_count=len(grp),
            radius=max(spread + SITE_RADIUS_MARGIN, MIN_SITE_RADIUS),
        ))

    return sorted(sites, key=lambda s: s.label)


def nearest_site(sites: list[Bombsite], x: float, y: float) -> tuple[str | None, float]:
    """The closest bombsite label and the distance to it."""
    if not sites:
        return None, float("nan")
    best = min(sites, key=lambda s: s.distance(x, y))
    return best.label, best.distance(x, y)


def site_zone(sites: list[Bombsite], x: float, y: float) -> str:
    """Coarse zone for a position: a site name, or "elsewhere".

    This is the whole area vocabulary available without callouts. It supports
    site-level questions (who defends where, how fast a retake arrives) and
    nothing finer; route and callout questions stay unanswered rather than
    being answered with made-up names.
    """
    for s in sites:
        if s.contains(x, y):
            return s.label
    return "elsewhere"


def radar_layers(match: Match, sites: list[Bombsite],
                 calibration: RadarCalibration | None) -> dict:
    """Event positions as 0-1 radar fractions, ready to draw.

    Only events are projected, not the position sample: 200 kills and 500
    grenades describe where a round is decided, while 60 000 position points
    would weigh down the payload to draw a cloud nobody can read.
    """
    if calibration is None:
        return {"note": f"no radar calibration available for {match.map_name}"}

    def project(x, y) -> tuple[float, float]:
        nx, ny = calibration.to_normalised(float(x), float(y))
        return round(nx, 4), round(ny, 4)

    kills = []
    if len(match.kills):
        k = match.kills[match.kills["round"].notna()]
        for row in k.itertuples(index=False):
            vx, vy = project(row.user_X, row.user_Y)
            entry = {
                "round": int(row.round),
                "victim": str(row.user_name),
                "victim_side": "T" if row.user_team_name == "TERRORIST" else "CT",
                "victim_team": str(row.user_team_clan_name),
                "weapon": str(row.weapon),
                "x": vx, "y": vy,
            }
            if pd.notna(row.attacker_X):
                ax, ay = project(row.attacker_X, row.attacker_Y)
                entry["attacker"] = str(row.attacker_name)
                entry["attacker_team"] = str(row.attacker_team_clan_name)
                entry["attacker_x"], entry["attacker_y"] = ax, ay
            kills.append(entry)

    plants = []
    for r in match.rounds:
        if not r.bomb_planted or r.plant_tick is None:
            continue
        match_row = match.plants[match.plants["tick"] == r.plant_tick]
        if match_row.empty:
            continue
        row = match_row.iloc[0]
        px, py = project(row["user_X"], row["user_Y"])
        plants.append({
            "round": r.number, "site": r.plant_site,
            "planter": str(row["user_name"]),
            "x": px, "y": py,
            "won_by_t": r.winner == "T",
        })

    utility = []
    if len(match.grenades):
        g = match.grenades
        g = g[(g["phase"] == "detonate") & g["round"].notna() & g["x"].notna()]
        for row in g.itertuples(index=False):
            ux, uy = project(row.x, row.y)
            utility.append({
                "round": int(row.round),
                "type": str(row.util),
                "thrower": str(row.user_name),
                "team": str(row.user_team_clan_name),
                "x": ux, "y": uy,
            })

    return {
        "image": f"{match.map_name}.png",
        "calibration": {"pos_x": calibration.pos_x, "pos_y": calibration.pos_y,
                        "scale": calibration.scale},
        "coordinate_note": ("x and y are fractions of the radar image, origin "
                            "top-left; multiply by the rendered size"),
        "bombsites": [
            {"label": s.label, "label_source": s.label_source,
             "x": project(s.centroid_x, s.centroid_y)[0],
             "y": project(s.centroid_x, s.centroid_y)[1],
             "radius_world_units": round(s.radius, 0),
             "radius_normalised": round(s.radius / calibration.scale / 1024.0, 4),
             "plants_observed": s.plant_count}
            for s in sites
        ],
        "kills": kills,
        "plants": plants,
        "utility": utility,
    }
