'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const clearPeopleHubCaches = () => {
      if (!('caches' in window)) return;
      caches.keys().then((keys) => {
        keys
          .filter((key) => key.startsWith('peoplehub-'))
          .forEach((key) => {
            void caches.delete(key);
          });
      });
    };

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
      clearPeopleHubCaches();
      return;
    }

    clearPeopleHubCaches();
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => {
        void registration.update();
      })
      .catch(() => {
        // Service worker is a progressive enhancement — ignore failures.
      });
  }, []);
  return null;
}
