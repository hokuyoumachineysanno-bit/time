const CACHE='attendance-v6.3-20260806';
const ASSETS=[
  './',
  './index.html',
  './styles.css?v=6.3.0',
  './app.js?v=6.3.0',
  './firebase-config.js?v=6.3.0',
  './cloud-sync.js?v=6.3.0',
  './manifest.webmanifest',
  './icon.svg'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request).then(found=>found||caches.match('./index.html')))
  );
});
