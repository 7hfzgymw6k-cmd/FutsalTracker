/*
 * Futsal Tracker Web
 * Copyright © 2026 Suunnittelu ja laskenta Oy Saga. All rights reserved.
 * Licensed for personal, non-commercial use only. See LICENSE.txt.
 */

const CACHE_NAME = "futsal-tracker-v3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./LICENSE.txt",
  "./AppIcon-1024.png",
  "./FutsalTrackerBrand.png",
  "./FutsalTrackerWideBrand.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

