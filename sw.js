// Release Quadri + Drive: never cache authenticated application pages.
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith("thermabot"))await caches.delete(name);await self.clients.claim();})()));
