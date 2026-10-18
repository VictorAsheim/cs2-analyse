import { notFound } from "next/navigation";

import IglBoard, { type IglData } from "@/components/IglBoard";
import { logoSrc, mapSrc } from "@/components/Badges";
import { readLeague } from "@/lib/analyses";

export const instant = false;

export async function generateStaticParams() {
  const league = await readLeague();
  return (league?.teams ?? [])
    .filter((t) => !t.us && t.demos_analysed > 0)
    .flatMap((t) =>
      Object.keys(t.maps).map((map) => ({
        slug: t.slug,
        map: map.replace(/^de_/, ""),
      })),
    );
}

export default async function IglMapPage(
  { params }: { params: Promise<{ slug: string; map: string }> },
) {
  const { slug, map } = await params;
  const league = await readLeague();
  const team = league?.teams.find((t) => t.slug === slug);
  const mapName = `de_${map}`;
  const data = team?.maps?.[mapName];
  if (!team || !data) notFound();

  const board: IglData = {
    team: team.name,
    teamSlug: team.slug,
    logo: logoSrc(team.slug),
    map: mapName,
    mapImage: mapSrc(mapName),
    matches: data.matches,
    roundsFor: data.rounds_for,
    roundsAgainst: data.rounds_against,
    theirT: data.t,
    theirCt: data.ct,
    plantsBySite: data.plants_by_site ?? {},
    medianArrival: data.median_arrival_seconds ?? null,
    // Their retake rate, which is what we face after planting.
    retakeBySite: Object.fromEntries(
      Object.entries(data.retake_by_site ?? {}).flatMap(([site, r]: [string, any]) =>
        r ? [[site, { numerator: r.numerator, denominator: r.denominator }]] : [],
      ),
    ),
    setups: data.setups ?? [],
    reactionBuys: data.reaction_buys ?? {
      after_loss: { rounds: 0, buys: {} },
      after_win: { rounds: 0, buys: {} },
    },
    findings: [...(data.weaknesses ?? []), ...(data.strengths ?? [])],
    crossMap: team.cross_map ?? [],
  };

  return <IglBoard data={board} />;
}
