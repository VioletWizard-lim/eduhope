// 오프라인에서도 앱 화면이 열리도록 기본 파일을 캐시한다. (데이터는 Firestore 가 따로 관리)
const CACHE = "eduhope-v1";
const ASSETS = ["./", "index.html", "css/style.css", "js/app.js", "js/store.js", "js/content.js", "js/firebase-config.js", "icons/icon.svg", "manifest.webmanifest"];

self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS))));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))),
);
// 네트워크 우선, 실패하면 캐시
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request)),
  );
});
