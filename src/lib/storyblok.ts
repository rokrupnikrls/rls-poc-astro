const token = import.meta.env.STORYBLOK_TOKEN;

export async function sbGetBySlug(fullSlug: string) {
  if (!token) throw new Error("Missing STORYBLOK_TOKEN");

  const url =
    `https://api.storyblok.com/v2/cdn/stories/${fullSlug}` +
    `?version=published&token=${token}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Storyblok error ${res.status}: ${await res.text()}`);

  const data = await res.json();
  return data.story;
}