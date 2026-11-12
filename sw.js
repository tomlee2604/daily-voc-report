/* 물류서비스 운영 통합 현황 — 서비스 워커
   업데이트 알림(웹 푸시)을 받아 보여주고, 알림을 누르면 리포트를 연다.
   화면 캐시는 하지 않음(항상 최신 화면). */
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(_){ d = {body: e.data ? e.data.text() : ''}; }
  var title = d.title || '물류서비스 운영 현황 업데이트';
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || '리포트가 업데이트됐어요.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'report-update',
    renotify: true,
    data: {url: d.url || './'}
  }));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i = 0; i < list.length; i++){
      if(list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]){ list[i].navigate(url).catch(function(){}); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
