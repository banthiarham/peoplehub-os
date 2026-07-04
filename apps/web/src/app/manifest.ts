import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PeopleHub OS',
    short_name: 'PeopleHub',
    description: 'Employee self-service — attendance, leave and payslips',
    start_url: '/me',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F6F7F9',
    theme_color: '#0F766E',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
