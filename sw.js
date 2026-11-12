/* 물류서비스 운영 통합 현황 — 서비스 워커
   업데이트 알림(웹 푸시)을 받아 보여주고, 알림을 누르면 리포트를 연다.
   화면 캐시는 하지 않음(항상 최신 화면). */
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

/* 앱 아이콘 빨간 숫자(배지): 알림이 올 때마다 1씩 올리고, 앱을 열면 0으로 */
function badgeAdd(){
  if(!self.navigator || !self.navigator.setAppBadge) return Promise.resolve();
  return caches.open('app-badge').then(function(c){
    return c.match('count').then(function(r){ return r ? r.text() : '0'; }).then(function(t){
      var n = (parseInt(t, 10) || 0) + 1;
      return c.put('count', new Response(String(n))).then(function(){ return self.navigator.setAppBadge(n); });
    });
  }).catch(function(){});
}
function badgeClear(){
  var p = caches.delete('app-badge').catch(function(){});
  if(self.navigator && self.navigator.clearAppBadge) self.navigator.clearAppBadge().catch(function(){});
  return p;
}

self.addEventListener('push', function(e){
  var d = {};
  try{ d = e.data ? e.data.json() : {}; }catch(_){ d = {body: e.data ? e.data.text() : ''}; }
  var title = d.title || '물류서비스 운영 현황 업데이트';
  e.waitUntil(Promise.all([badgeAdd(), self.registration.showNotification(title, {
    body: d.body || '리포트가 업데이트됐어요.',
    icon: 'icon-192.png',
    badge: 'icon-192.png',
    tag: d.tag || 'report-update',
    renotify: true,
    data: {url: d.url || './'}
  })]));
});

self.addEventListener('notificationclick', function(e){
  e.notification.close();
  badgeClear();
  var url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list){
    for(var i = 0; i < list.length; i++){
      if(list[i].url.indexOf(self.registration.scope) === 0 && 'focus' in list[i]){ list[i].navigate(url).catch(function(){}); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
