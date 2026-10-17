import fs from "node:fs";
import path from "node:path";

/**
 * Team logos and map thumbnails, looked up by slug.
 *
 * The directory is read once at module load and cached: these are static
 * files that only change when someone adds one, and the alternative is a
 * filesystem hit for every row of every table.
 *
 * The extension varies per file, so it is discovered rather than assumed - a
 * logo saved as .jpg and one as .png both have to resolve from the slug
 * alone.
 */
function indexDir(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const file of fs.readdirSync(path.join(process.cwd(), "public", dir))) {
      if (file.toLowerCase().endsWith(".md")) continue;
      const stem = file.replace(/\.[^.]+$/, "");
      out[stem] = `${dir}/${file}`;
    }
  } catch {
    // No directory yet: every lookup misses and the text-only fallback shows.
  }
  return out;
}

const LOGOS = indexDir("logos");
const MAPS = indexDir("maps");

const base = () => process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const mapLabel = (m: string) => m.replace(/^de_/, "");

export function logoSrc(slug: string): string | null {
  const file = LOGOS[slug];
  return file ? `${base()}/${file}` : null;
}

export function mapSrc(mapName: string): string | null {
  const file = MAPS[mapLabel(mapName)];
  return file ? `${base()}/${file}` : null;
}

/**
 * A team name with its crest.
 *
 * The name is always rendered; the logo is decoration beside it. A team
 * whose image is missing still reads correctly, which matters because the
 * division has teams nobody has demos for yet.
 */
export function TeamBadge({
  slug, name, size = 20, className = "",
}: { slug: string; name: string; size?: number; className?: string }) {
  const src = logoSrc(slug);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a local static
        // file in a statically exported site; the optimiser needs a server
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="shrink-0 rounded-sm object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          aria-hidden
          className="shrink-0 rounded-sm bg-neutral-800"
          style={{ width: size, height: size }}
        />
      )}
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

/** A map name with a thumbnail of it. */
export function MapBadge({
  map, size = 28, className = "", bold = false,
}: { map: string; size?: number; className?: string; bold?: boolean }) {
  const src = mapSrc(map);
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- see above
        <img
          src={src}
          alt=""
          className="shrink-0 rounded object-cover"
          style={{ width: size, height: size }}
        />
      ) : (
        <span
          aria-hidden
          className="shrink-0 rounded bg-neutral-800"
          style={{ width: size, height: size }}
        />
      )}
      <span className={bold ? "font-semibold" : ""}>{mapLabel(map)}</span>
    </span>
  );
}

/** A wide map image for the headline cards, with the name over it. */
export function MapTile({ map, label }: { map: string; label: string }) {
  const src = mapSrc(map);
  return (
    <div className="relative overflow-hidden rounded-lg border border-neutral-800">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- see above
        <img
          src={src}
          alt=""
          className="h-24 w-full object-cover opacity-45"
        />
      ) : (
        <div className="h-24 w-full bg-neutral-900" />
      )}
      <div className="absolute inset-0 flex flex-col justify-center bg-gradient-to-r from-neutral-950/85 to-neutral-950/40 px-4">
        <p className="text-xs text-neutral-400">{label}</p>
        <p className="mt-0.5 text-lg font-semibold text-neutral-50">
          {mapLabel(map)}
        </p>
      </div>
    </div>
  );
}
