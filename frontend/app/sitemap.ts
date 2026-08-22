import type { MetadataRoute } from 'next';

// Private surfaces (dashboard, settings, auth flows, share pages) are
// excluded — robots.txt disallows them and their layouts emit noindex tags.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: '/', lastModified: now, changeFrequency: 'monthly', priority: 1 },
    { url: '/terms', lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
    { url: '/privacy', lastModified: now, changeFrequency: 'yearly', priority: 0.3 },
  ];
}
