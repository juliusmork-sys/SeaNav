import { neon } from "@neondatabase/serverless";

// Neon-integrasjonen i Vercel setter DATABASE_URL; POSTGRES_URL støttes som
// alternativ. Tom streng => DB ikke konfigurert => kallere faller tilbake til
// live-API.
const connectionString =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "";

export const isDbConfigured = connectionString.length > 0;

const sql = isDbConfigured ? neon(connectionString) : null;

export type BoundingBox = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type HarborRow = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  type: string | null;
  website: string | null;
  phone: string | null;
  openingHours: string | null;
  capacity: string | null;
  amenities: string[];
};

export type BeachRow = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  municipality: string | null;
  waterQuality: string | null;
  monitored: string | null;
  geometry: unknown;
};

export async function ensureSchema() {
  if (!sql) return;
  await sql`
    create table if not exists harbors (
      id text primary key,
      name text not null,
      lat double precision not null,
      lon double precision not null,
      type text,
      website text,
      phone text,
      opening_hours text,
      capacity text,
      amenities jsonb not null default '[]',
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists harbors_bbox on harbors (lat, lon)`;
  await sql`
    create table if not exists beaches (
      id text primary key,
      name text not null,
      lat double precision not null,
      lon double precision not null,
      municipality text,
      water_quality text,
      monitored text,
      geometry jsonb not null,
      updated_at timestamptz not null default now()
    )
  `;
  await sql`create index if not exists beaches_bbox on beaches (lat, lon)`;
}

export async function countHarbors(): Promise<number> {
  if (!sql) return 0;
  const rows = (await sql`select count(*)::int as n from harbors`) as {
    n: number;
  }[];
  return rows[0]?.n ?? 0;
}

export async function countBeaches(): Promise<number> {
  if (!sql) return 0;
  const rows = (await sql`select count(*)::int as n from beaches`) as {
    n: number;
  }[];
  return rows[0]?.n ?? 0;
}

export async function selectHarborsInBbox(
  bbox: BoundingBox,
): Promise<HarborRow[]> {
  if (!sql) return [];
  const rows = (await sql`
    select id, name, lat, lon, type, website, phone,
           opening_hours as "openingHours", capacity, amenities
    from harbors
    where lat between ${bbox.south} and ${bbox.north}
      and lon between ${bbox.west} and ${bbox.east}
    limit 500
  `) as HarborRow[];
  return rows;
}

export async function selectBeachesInBbox(
  bbox: BoundingBox,
): Promise<BeachRow[]> {
  if (!sql) return [];
  const rows = (await sql`
    select id, name, lat, lon, municipality,
           water_quality as "waterQuality", monitored, geometry
    from beaches
    where lat between ${bbox.south} and ${bbox.north}
      and lon between ${bbox.west} and ${bbox.east}
    limit 1000
  `) as BeachRow[];
  return rows;
}

export async function upsertHarbors(harbors: HarborRow[]): Promise<number> {
  if (!sql || harbors.length === 0) return 0;
  await sql.query(
    `insert into harbors (id, name, lat, lon, type, website, phone, opening_hours, capacity, amenities)
     select * from unnest(
       $1::text[], $2::text[], $3::double precision[], $4::double precision[],
       $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::jsonb[]
     )
     on conflict (id) do update set
       name = excluded.name, lat = excluded.lat, lon = excluded.lon,
       type = excluded.type, website = excluded.website, phone = excluded.phone,
       opening_hours = excluded.opening_hours, capacity = excluded.capacity,
       amenities = excluded.amenities, updated_at = now()`,
    [
      harbors.map((h) => h.id),
      harbors.map((h) => h.name),
      harbors.map((h) => h.lat),
      harbors.map((h) => h.lon),
      harbors.map((h) => h.type),
      harbors.map((h) => h.website),
      harbors.map((h) => h.phone),
      harbors.map((h) => h.openingHours),
      harbors.map((h) => h.capacity),
      harbors.map((h) => JSON.stringify(h.amenities)),
    ],
  );
  return harbors.length;
}

export async function upsertBeaches(beaches: BeachRow[]): Promise<number> {
  if (!sql || beaches.length === 0) return 0;
  await sql.query(
    `insert into beaches (id, name, lat, lon, municipality, water_quality, monitored, geometry)
     select * from unnest(
       $1::text[], $2::text[], $3::double precision[], $4::double precision[],
       $5::text[], $6::text[], $7::text[], $8::jsonb[]
     )
     on conflict (id) do update set
       name = excluded.name, lat = excluded.lat, lon = excluded.lon,
       municipality = excluded.municipality, water_quality = excluded.water_quality,
       monitored = excluded.monitored, geometry = excluded.geometry, updated_at = now()`,
    [
      beaches.map((b) => b.id),
      beaches.map((b) => b.name),
      beaches.map((b) => b.lat),
      beaches.map((b) => b.lon),
      beaches.map((b) => b.municipality),
      beaches.map((b) => b.waterQuality),
      beaches.map((b) => b.monitored),
      beaches.map((b) => JSON.stringify(b.geometry)),
    ],
  );
  return beaches.length;
}
