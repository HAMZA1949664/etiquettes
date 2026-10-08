/* Service worker : le site s'ouvre et génère des étiquettes même sans Internet.
   Stratégie « réseau d'abord » : toujours la dernière version quand Internet est là,
   la copie gardée sur le poste sinon. Les appels à la base (Supabase) ne sont jamais mis en cache. */
var CACHE = "etiquettes-v1";
var FICHIERS = ["./", "index.html", "assets/style.css", "assets/config.js", "assets/nlbl.js", "assets/modele-zebra.js",
                "assets/regles.js", "assets/app.js", "assets/logo-clement.png", "assets/logo-clement-blanc.png", "assets/icone.png"];
self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FICHIERS); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (cles) {
    return Promise.all(cles.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (rep) {
      if (rep && rep.ok) { var copie = rep.clone(); caches.open(CACHE).then(function (c) { c.put(req, copie); }); }
      return rep;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (r) { return r || caches.match("index.html"); });
    })
  );
});
