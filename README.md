# Desktop App

Bu klasor Electron tabanli masaustu istemciyi barindirir.

## Mevcut durum

- Guvenli BrowserWindow ayarlari (context isolation, sandbox, preload bridge)
- Main process IPC kanallari (auth, session, lobby state, realtime)
- Login/register/logout oturum akisi
- Realtime socket baglantisi ve lobiye katil/ayril/mute komutlari
- Baslangic lobi ekrani ve uye listesi goruntuleme
- WebRTC mikrofon akisi, cihaz secimi ve basic peer signaling
- Reconnect sonrasi otomatik lobiye yeniden katilim

## Ortam degiskenleri

Desktop main process artik `.env` dosyasini otomatik okur.

1. `.env.example` dosyasini `.env` olarak kopyalayin.
2. Degerleri ortaminiza gore duzenleyin.

Kullanilan degiskenler:

- `CT_BACKEND_URL`: Go backend adresi (ornek: `http://127.0.0.1:4001`)
- `CT_LIVEKIT_ROOM`: Desktop'in token isterken kullanacagi varsayilan oda
- `CT_ICE_URLS`: Virgulle ayrilmis ICE/STUN/TURN URL listesi
- `CT_ICE_USERNAME`: (Opsiyonel) TURN username
- `CT_ICE_CREDENTIAL`: (Opsiyonel) TURN credential

Ornek:
CT_BACKEND_URL=http://127.0.0.1:4001
CT_LIVEKIT_ROOM=main-lobby
CT_ICE_URLS=stun:stun.l.google.com:19302,turn:turn.example.com:3478
CT_ICE_USERNAME=turn-user
CT_ICE_CREDENTIAL=turn-pass

## Siradaki hedefler

- Ses paketleme (Opus) ve peer/sfu sinyal akislarinin tamamlanmasi
- Realtime olaylari icin renderer testleri

## OTA guncelleme akisi

Desktop istemci `electron-updater` ile GitHub release uzerinden otomatik guncelleme kontrolu yapar.

- Uygulama acildiginda ve calisirken periyodik olarak guncelleme kontrol edilir.
- Yeni surum bulunduysa, header'da surum bilgisinin yaninda `Guncelle` butonu gorunur.
- Kullanici butona bastiginda guncelleme indirilir; indirme bitince `Yukle` ile uygulama yeniden baslatilip yeni surum kurulur.

### GitHub release otomasyonu

`/.github/workflows/desktop-release.yml` workflow'u su sekilde calisir:

1. `main` branch'e push oldugunda tetiklenir.
2. `desktop/package.json` icindeki versiyon degerini okur.
3. O versiyon icin release yoksa Windows installer artefaktlarini (`.exe`, `.blockmap`, `latest.yml`) olusturur.
4. GitHub release olusturup bu dosyalari yukler.

Not: Yeni OTA dagitimi icin `desktop/package.json` versiyonunu arttirman gerekir.



kullanıcı başka kullanıcıların mikrofon ve kulaklık durumlarını sürekli açık olarak görüyor.kapatılıp açılsa bile aynı şekilde kalıyor bu sorunu düzelt.ilk bağlanıldığında mikrofon kapalı oluyor ama ses gidiyor.bunuda düzelt.lobide kullanıcıların gözüktüğü yerde kutularda uygulama ikonu değil,eğer yayın ya da kamera açık değilse kullanıcı listesindeki gibi harfler gözükmesini sağla.kullanıcı hem kamera hem yayın açarsa kameranın kullanıcı kutusunda,yayınında ekstra bir kutuda sadece altta yine kullanıcının adı gözükecek şekilde olmasını sağla.