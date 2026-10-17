"""Demo property paths and enum mappings.

Only aliases confirmed present in demoparser2 0.42 output are used; everything
else is addressed by its full entity field path.
"""

GR = "CCSGameRulesProxy.CCSGameRules."

# Game-rules props sampled per tick. These are replicated to every entity, so
# the extractor collapses them to one row per tick.
GAMERULES = [
    "total_rounds_played",
    "is_warmup_period",
    "is_freeze_period",
    "is_bomb_planted",
    GR + "m_nRoundStartCount",
    GR + "m_nRoundEndCount",
    GR + "m_iRoundEndWinnerTeam",
    GR + "m_eRoundEndReason",
    GR + "m_iFirstSecondHalfRound",
    GR + "m_gamePhase",
    GR + "m_nOvertimePlaying",
]

# Per-player props sampled per tick.
PLAYER_TICK = [
    "X", "Y", "Z",
    "yaw",
    "health",
    "is_alive",
    "team_name",
    "team_clan_name",
]

# Per-player props read once per round (at freeze-time end / round end).
PLAYER_ROUND = [
    "balance",
    "current_equip_value",
    "team_name",
    "team_clan_name",
    "is_alive",
]

# m_iRoundEndWinnerTeam
TEAM_NUM = {2: "T", 3: "CT"}

# m_eRoundEndReason (CSRoundEndReason). Only values observed in real demos are
# mapped; anything else is reported as "unknown_<n>" rather than guessed.
ROUND_END_REASON = {
    1: "target_bombed",
    7: "bomb_defused",
    8: "ct_win_elimination",
    9: "t_win_elimination",
    10: "draw",
    12: "target_saved",      # time expired, CT win
}

# Grenades that carry tactical meaning, by event name.
UTILITY_EVENTS = {
    "flashbang_detonate": "flashbang",
    "smokegrenade_detonate": "smoke",
    "hegrenade_detonate": "he",
    "decoy_started": "decoy",
    "inferno_startburn": "molotov",
}

WEAPON_CLASS = {
    "awp": "awp", "ssg08": "scout", "g3sg1": "autosniper", "scar20": "autosniper",
    "ak47": "rifle", "m4a1": "rifle", "m4a1_silencer": "rifle", "m4a4": "rifle",
    "galilar": "rifle", "famas": "rifle", "aug": "rifle", "sg556": "rifle",
    "mp9": "smg", "mac10": "smg", "mp7": "smg", "mp5sd": "smg", "ump45": "smg",
    "p90": "smg", "bizon": "smg",
    "nova": "shotgun", "xm1014": "shotgun", "mag7": "shotgun", "sawedoff": "shotgun",
    "m249": "lmg", "negev": "lmg",
    "glock": "pistol", "usp_silencer": "pistol", "hkp2000": "pistol", "p250": "pistol",
    "fiveseven": "pistol", "tec9": "pistol", "cz75a": "pistol", "deagle": "pistol",
    "revolver": "pistol", "elite": "pistol",
    "knife": "melee", "bayonet": "melee", "taser": "taser",
    "hegrenade": "nade", "molotov": "nade", "incgrenade": "nade",
    "inferno": "nade", "flashbang": "nade", "decoy": "nade", "smokegrenade": "nade",
}
