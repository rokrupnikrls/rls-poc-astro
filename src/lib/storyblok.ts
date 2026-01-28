const token = import.meta.env.STORYBLOK_TOKEN;

if (!token) {
  throw new Error("Missing STORYBLOK_TOKEN");
}

export async function sbGetBySlug(fullSlug: string) {
  const url =
    `https://api.storyblok.com/v2/cdn/stories/${fullSlug}` +
    `?version=published&token=${token}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Storyblok error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.story;
}

export async function sbGetSlugsByPrefix(prefix: string): Promise<string[]> {
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;

  const url =
    `https://api.storyblok.com/v2/cdn/stories` +
    `?starts_with=${encodeURIComponent(normalized)}` +
    `&version=published&token=${token}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Storyblok list error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  if (!Array.isArray(data.stories)) return [];

  return data.stories
    .map((s: any) => s.full_slug as string)
    .filter((full: string) => full.startsWith(normalized))
    .map((full: string) => full.slice(normalized.length));
}