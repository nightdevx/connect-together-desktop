export const buildDesktopLayout = (): string => {
  return `
    <main class="app-shell relative flex flex-col w-full h-dvh min-h-dvh bg-surface-0 overflow-hidden">

      <!-- ═══ Window Titlebar ═══ -->
      <header class="window-titlebar flex items-center justify-between gap-2.5 px-3 py-1.5 h-11 border-b border-border glass-heavy z-10">
        <div class="flex items-center gap-2">
          <img src="./images/logo.png" alt="Connect Together" class="w-4 h-4 rounded object-cover" />
          <span class="text-xs font-semibold tracking-wider uppercase text-text-secondary">Connect Together</span>
        </div>
        <div class="window-controls flex items-center gap-1" role="group" aria-label="Pencere İşlemleri">
          <button id="windowMinimize" class="window-control w-9 h-8 rounded-lg border border-border bg-transparent text-text-secondary grid place-items-center" type="button" title="Küçült" aria-label="Küçült">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 11h14a1 1 0 1 1 0 2H5a1 1 0 1 1 0-2Z" />
            </svg>
          </button>
          <button id="windowMaximize" class="window-control w-9 h-8 rounded-lg border border-border bg-transparent text-text-secondary grid place-items-center" type="button" title="Büyüt" aria-label="Büyüt">
            <svg class="window-icon-max w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 5h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v10h12V7H6Z" />
            </svg>
            <svg class="window-icon-restore w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M8 4h10a2 2 0 0 1 2 2v10h-2V6H8V4Zm-2 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Zm0 2v10h10V10H6Z" />
            </svg>
          </button>
          <button id="windowClose" class="window-control danger w-9 h-8 rounded-lg border border-danger/20 bg-danger/5 text-danger/80 grid place-items-center" type="button" title="Kapat" aria-label="Kapat">
            <svg class="w-4 h-4 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6.7 5.3a1 1 0 0 1 1.4 0L12 9.2l3.9-3.9a1 1 0 1 1 1.4 1.4L13.4 10.6l3.9 3.9a1 1 0 0 1-1.4 1.4L12 12l-3.9 3.9a1 1 0 0 1-1.4-1.4l3.9-3.9-3.9-3.9a1 1 0 0 1 0-1.4Z" />
            </svg>
          </button>
        </div>
      </header>

      <!-- ═══ App Header ═══ -->
      <header class="flex items-center justify-between gap-3 px-5 py-3 min-h-16 border-b border-border glass z-10">
        <div class="flex items-center gap-3">
          <img src="./images/logo.png" alt="Connect Together" class="w-10 h-10 rounded-xl object-cover shadow-[0_4px_20px_var(--color-accent-glow)]" />
          <div>
            <p class="text-[10px] font-medium tracking-[0.18em] uppercase text-text-muted m-0">Topluluk Ses Alanı</p>
            <h1 class="text-lg font-bold text-text-primary m-0">Connect Together</h1>
          </div>
        </div>
        <div class="flex gap-2">
          <div class="meta-pill version-pill flex items-center gap-2 h-9 px-3.5 rounded-full border border-border bg-surface-2/60 text-text-secondary text-xs">
            <span>Sürüm</span>
            <strong id="version" class="text-text-primary font-semibold">v-</strong>
            <span id="updateHint" class="update-hint hidden" aria-live="polite"></span>
            <button id="updateActionButton" class="update-action hidden" type="button">Güncelle</button>
          </div>
          <div id="connectionBadge" class="meta-pill live flex items-center gap-2 h-9 px-3.5 rounded-full border border-border bg-surface-2/60 text-text-secondary text-xs" data-state="warn">
            <span>Bağlantı</span>
            <strong id="connectionState" class="text-text-primary font-semibold">Hazırlanıyor</strong>
          </div>
        </div>
      </header>

      <!-- ═══ Auth View ═══ -->
      <section id="authView" class="flex-1 overflow-auto z-10">
        <div class="max-w-lg mx-auto mt-10 mb-10 p-6 rounded-2xl border border-border glass">
          <!-- Decorative orb -->
          <div class="flex justify-center mb-6">
            <img src="./images/logo.png" alt="Connect Together" class="w-20 h-20 rounded-2xl object-cover shadow-[0_8px_40px_var(--color-accent-glow)]" style="animation: float 3s ease-in-out infinite;" />
          </div>

          <div class="auth-tabs grid grid-cols-2 gap-2 mb-5">
            <button id="loginTab" class="auth-tab h-11 rounded-xl border border-border bg-surface-2 text-text-secondary font-semibold text-sm active" type="button">Giriş Yap</button>
            <button id="registerTab" class="auth-tab h-11 rounded-xl border border-border bg-surface-2 text-text-secondary font-semibold text-sm" type="button">Kayıt Ol</button>
          </div>

          <section id="loginPane" class="auth-pane active">
            <h2 class="text-xs font-bold tracking-[0.12em] uppercase text-text-secondary mb-1">Hesaba Giriş</h2>
            <p class="text-text-muted text-sm mb-4">Discord benzeri hızlı lobi deneyimi için hesabınla devam et.</p>
            <form id="loginForm" class="flex flex-col gap-3">
              <input id="loginUsername" type="text" placeholder="Kullanıcı adı" minlength="3" required />
              <input id="loginPassword" type="password" placeholder="Şifre" minlength="8" required />
              <button id="loginButton" class="btn-primary w-full" type="submit">Giriş Yap</button>
            </form>
            <div class="mt-4 text-text-muted text-sm">
              Hesabın yok mu?
              <button id="goRegister" class="bg-transparent border-0 text-accent-hover underline cursor-pointer font-medium p-0" type="button">Kayıt ekranına geç</button>
            </div>
          </section>

          <section id="registerPane" class="auth-pane">
            <h2 class="text-xs font-bold tracking-[0.12em] uppercase text-text-secondary mb-1">Yeni Hesap</h2>
            <p class="text-text-muted text-sm mb-4">Arkadaş grubun için saniyeler içinde bir hesap oluştur.</p>
            <form id="registerForm" class="flex flex-col gap-3">
              <input id="registerUsername" type="text" placeholder="Kullanıcı adı" minlength="3" required />
              <input id="registerPassword" type="password" placeholder="Şifre" minlength="8" required />
              <button id="registerButton" class="btn-warn w-full" type="submit">Kayıt Ol</button>
            </form>
            <div class="mt-4 text-text-muted text-sm">
              Hesabın zaten var mı?
              <button id="goLogin" class="bg-transparent border-0 text-accent-hover underline cursor-pointer font-medium p-0" type="button">Giriş ekranına dön</button>
            </div>
          </section>
        </div>
      </section>

      <!-- ═══ Lobby View ═══ -->
      <section id="lobbyView" class="hidden flex-1 min-h-0 z-10">
        <div class="workspace-grid grid grid-cols-[64px_260px_minmax(0,1fr)] w-full h-full min-h-0 overflow-hidden">

          <!-- ─── Server Rail ─── -->
          <aside class="server-rail-container flex flex-col justify-between gap-2 py-3 px-2 border-r border-border bg-surface-0/90" aria-label="Navigasyon">
            <div class="rail-main-actions flex flex-col gap-2">
              <button id="navUsers" class="rail-icon w-12 h-14 rounded-2xl border border-border bg-surface-2 text-text-secondary text-[10px] font-bold flex flex-col items-center justify-center gap-1 cursor-pointer" type="button" title="Arkadaşlar">
                <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M8.5 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19a4.5 4.5 0 0 1 4.5-4.5h4A4.5 4.5 0 0 1 15 19v1H2v-1Zm13 1v-1a5.9 5.9 0 0 0-1.44-3.89A4.3 4.3 0 0 1 22 19v1h-7Z"/>
                </svg>
                <span class="leading-none">Arkadaş</span>
                <span class="rail-tooltip">Arkadaşlar</span>
              </button>

              <button id="navLobby" class="rail-icon w-12 h-14 rounded-2xl border border-border bg-surface-2 text-text-secondary text-[10px] font-bold flex flex-col items-center justify-center gap-1 cursor-pointer" type="button" title="Lobi">
                <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-6.2l-3.54 2.95a1 1 0 0 1-1.64-.77V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm1 2v9h2.62a1 1 0 0 1 1 1v1.24L12 15.2a1 1 0 0 1 .64-.2H19V6H6Zm2.5 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm4 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm4 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/>
                </svg>
                <span class="leading-none">Lobi</span>
                <span class="rail-tooltip">Lobi</span>
              </button>
            </div>

            <button id="navSettings" class="rail-icon w-12 h-14 rounded-2xl border border-border bg-surface-2 text-text-secondary text-[10px] font-bold flex flex-col items-center justify-center gap-1 cursor-pointer mt-auto" type="button" title="Ayarlar">
              <svg class="w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5Zm7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65A.49.49 0 0 0 14 3h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 12c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66Z"/>
              </svg>
              <span class="leading-none">Ayar</span>
              <span class="rail-tooltip">Ayarlar</span>
            </button>
          </aside>

          <!-- ─── Channel Sidebar ─── -->
          <aside class="channel-sidebar-container border-r border-border bg-surface-1/70 grid grid-rows-[1fr_auto] min-h-0" aria-label="Yan Panel">

            <!-- Lobby Sidebar -->
            <section id="lobbySidebar" class="side-view min-h-0 grid grid-rows-[auto_1fr]">
              <header class="side-view-header px-4 pt-4 pb-3 border-b border-border">
                <h2 class="text-base font-bold tracking-[0.08em] uppercase text-text-primary m-0">Lobi</h2>
              </header>
              <div class="side-view-body overflow-auto px-3 py-3">
                <p class="text-text-muted text-xs mb-2">Sohbette olan arkadaşlar</p>
                <ul id="members" class="list-none m-0 p-0 flex flex-col gap-2"></ul>
              </div>
            </section>

            <!-- Users Sidebar -->
            <section id="usersSidebar" class="side-view hidden min-h-0 grid grid-rows-[auto_1fr]">
              <header class="side-view-header px-4 pt-4 pb-3 border-b border-border">
                <h2 class="text-base font-bold tracking-[0.08em] uppercase text-text-primary m-0">Arkadaşlar</h2>
              </header>
              <div class="side-view-body overflow-auto px-3 py-3">
                <p class="text-text-muted text-xs mb-2">Arkadaş listesini ve çevrimiçi durumunu buradan görebilirsin.</p>
                <div class="sidebar-stat-card rounded-xl border border-border bg-surface-2/50 p-3 mb-2">
                  <span class="text-text-muted text-[11px] uppercase tracking-wider">Toplam Kullanıcı</span>
                  <strong id="usersDirectoryCount" class="block mt-1 text-text-primary text-lg font-bold">0</strong>
                </div>
              </div>
            </section>

            <!-- Settings Sidebar -->
            <section id="settingsSidebar" class="side-view hidden min-h-0 grid grid-rows-[auto_1fr]">
              <header class="side-view-header px-4 pt-4 pb-3 border-b border-border">
                <h2 class="text-base font-bold tracking-[0.08em] uppercase text-text-primary m-0">Ayarlar</h2>
              </header>
              <div class="side-view-body overflow-auto px-3 py-3">
                <div class="sidebar-stat-card rounded-xl border border-border bg-surface-2/50 p-3 mb-3">
                  <span class="text-text-muted text-[11px] uppercase tracking-wider">Kullanıcı</span>
                  <strong id="currentUser" class="block mt-1 text-text-primary font-semibold">-</strong>
                </div>
                <nav class="flex flex-col gap-3" aria-label="Ayar Kategorileri">
                  <div class="settings-nav-group">
                    <p class="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Hesap</p>
                    <div class="flex flex-col gap-2">
                      <button id="settingsTabProfile" class="settings-nav-button h-10 rounded-xl border border-border bg-surface-2/50 text-text-secondary text-left px-3 text-sm font-medium active" type="button">Profil</button>
                      <button id="settingsTabSecurity" class="settings-nav-button h-10 rounded-xl border border-border bg-surface-2/50 text-text-secondary text-left px-3 text-sm font-medium" type="button">Güvenlik</button>
                      <button id="settingsTabSession" class="settings-nav-button h-10 rounded-xl border border-border bg-surface-2/50 text-text-secondary text-left px-3 text-sm font-medium" type="button">Oturum</button>
                    </div>
                  </div>

                  <div class="settings-nav-group">
                    <p class="m-0 mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-muted">Medya</p>
                    <div class="flex flex-col gap-2">
                      <button id="settingsTabVoice" class="settings-nav-button h-10 rounded-xl border border-border bg-surface-2/50 text-text-secondary text-left px-3 text-sm font-medium" type="button">Ses</button>
                      <button id="settingsTabCamera" class="settings-nav-button h-10 rounded-xl border border-border bg-surface-2/50 text-text-secondary text-left px-3 text-sm font-medium" type="button">Kamera</button>
                      <button id="settingsTabBroadcast" class="settings-nav-button h-10 rounded-xl border border-border bg-surface-2/50 text-text-secondary text-left px-3 text-sm font-medium" type="button">Yayın</button>
                    </div>
                  </div>
                </nav>
              </div>
            </section>

            <!-- ─── Quick Controls ─── -->
            <section class="sidebar-quick-controls border-t border-border p-3 bg-surface-0/60" aria-label="Hızlı Kontroller">
              <section class="voice-connection-shell mb-3" aria-label="Ses bağlantı detayları">
                <button id="connectionDiagBanner" class="voice-connection-banner" type="button" aria-expanded="false" aria-controls="connectionDiagDetailsCard" data-state="idle">
                  <div class="voice-connection-banner-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" class="w-4 h-4 fill-current" focusable="false">
                      <path id="connectionDiagIconPath" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 5a1 1 0 1 0-2 0v5c0 .38.21.72.55.89l3 1.8a1 1 0 1 0 1-1.72L13 11.44V7Z"/>
                    </svg>
                  </div>
                  <span id="connectionDiagStatus" class="voice-connection-status">Ses bağlantısı bekleniyor</span>
                </button>

                <div id="connectionDiagDetailsCard" class="voice-details-card hidden">
                  <h3 class="voice-details-title">Ses Detayları</h3>
                  <div class="voice-details-tabs" role="tablist" aria-label="Ses detay sekmeleri">
                    <button id="connectionDiagTabConnection" class="voice-details-tab active" type="button" role="tab" aria-selected="true">Bağlantı</button>
                    <button id="connectionDiagTabPrivacy" class="voice-details-tab" type="button" role="tab" aria-selected="false">Gizlilik</button>
                  </div>

                  <div id="connectionDiagPanelConnection" class="voice-details-panel" role="tabpanel">
                    <p class="voice-detail-row">Ortalama ping: <strong id="connectionDiagAvgPing">-</strong></p>
                    <p class="voice-detail-row">Son ping: <strong id="connectionDiagLastPing">-</strong></p>
                    <p class="voice-detail-row">Giden paket kayıp oranı: <strong id="connectionDiagPacketLoss">%0.0</strong></p>
                    <p id="connectionDiagHint" class="voice-detail-hint">250 ms ve üzerinde gecikme ses sorunları yaratabilir. Paket kaybı artarsa bağlantını kontrol et.</p>
                  </div>

                  <div id="connectionDiagPanelPrivacy" class="voice-details-panel hidden" role="tabpanel">
                    <p class="voice-detail-row">Şifreleme: <strong id="connectionDiagEncryption">Uçtan uca şifrelenmiş</strong></p>
                    <p class="voice-detail-hint">Ses trafiği güvenli kanal üzerinden iletilir. Ek koruma için güçlü bir ağ ve güncel istemci kullan.</p>
                  </div>

                  <div class="voice-details-footer">
                    <span class="voice-details-lock">Uçtan uca şifrelenmiş</span>
                    <button id="connectionDiagLearnMore" class="voice-details-link" type="button">Daha fazla bilgi edin</button>
                  </div>
                </div>
              </section>

              <div class="sidebar-quick-grid grid grid-cols-5 gap-2">
                <button id="quickMicToggle" class="quick-icon-button h-12 rounded-xl border border-border bg-surface-2/50 text-text-secondary flex flex-col items-center justify-center gap-0.5 cursor-pointer" type="button" title="Mikrofon" data-state-text="ON">
                  <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm5-3a1 1 0 0 1 2 0 7 7 0 0 1-6 6.93V20h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0Z" />
                  </svg>
                  <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M18.9 17.5A7 7 0 0 1 13 19.93V22h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 13a1 1 0 1 1 2 0 5 5 0 0 0 8.73 3.4ZM15 8v2.17l-6-6V8a3 3 0 0 0 6 0ZM2.3 20.3a1 1 0 1 0 1.4 1.4l18-18a1 1 0 1 0-1.4-1.4l-18 18Z" />
                  </svg>
                  <span class="sr-only">Mikrofon</span>
                </button>

                <button id="quickCameraToggle" class="quick-icon-button h-12 rounded-xl border border-border bg-surface-2/50 text-text-secondary flex flex-col items-center justify-center gap-0.5 cursor-pointer" type="button" title="Kamera" data-state-text="OFF">
                  <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M17 7a2 2 0 0 1 2 2v1.18l2.22-1.33A1 1 0 0 1 23 9.7v4.6a1 1 0 0 1-1.78.85L19 13.82V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h12Zm-13.7 13.3a1 1 0 0 0 1.4 1.4l16-16a1 1 0 1 0-1.4-1.4l-16 16Z"/>
                  </svg>
                  <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M17 7a2 2 0 0 1 2 2v1.18l2.22-1.33A1 1 0 0 1 23 9.7v4.6a1 1 0 0 1-1.78.85L19 13.82V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h12Z"/>
                  </svg>
                  <span class="sr-only">Kamera</span>
                </button>

                <button id="quickScreenToggle" class="quick-icon-button h-12 rounded-xl border border-border bg-surface-2/50 text-text-secondary flex flex-col items-center justify-center gap-0.5 cursor-pointer" type="button" title="Ekran Paylaşımı" data-state-text="OFF">
                  <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v1h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2v-1H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v9h16V7H4Zm-.7 13.3a1 1 0 0 0 1.4 1.4l18-18a1 1 0 1 0-1.4-1.4l-18 18Z"/>
                  </svg>
                  <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v1h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2v-1H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v9h16V7H4Z"/>
                  </svg>
                  <span class="sr-only">Ekran Paylaşımı</span>
                </button>

                <button id="quickHeadphoneToggle" class="quick-icon-button h-12 rounded-xl border border-border bg-surface-2/50 text-text-secondary flex flex-col items-center justify-center gap-0.5 cursor-pointer" type="button" title="Kulaklık" data-state-text="ON">
                  <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 4a8 8 0 0 0-8 8v4a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H6v-1a6 6 0 1 1 12 0v1h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-4a8 8 0 0 0-8-8Z" />
                  </svg>
                  <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M12 4a8 8 0 0 0-7.69 10.2A3 3 0 0 0 4 15v1a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-2.17l-4-4V11a6 6 0 0 1 10.73-3.67l1.43 1.43A7.95 7.95 0 0 0 12 4ZM20 16v-2a8.16 8.16 0 0 0-.4-2.52L22 13.88V16a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2v-.88l2 2A3 3 0 0 0 20 16Zm-16.7 4.3a1 1 0 0 0 1.4 1.4l16-16a1 1 0 1 0-1.4-1.4l-16 16Z" />
                  </svg>
                  <span class="sr-only">Kulaklık</span>
                </button>

                <button id="quickConnectionToggle" class="quick-icon-button h-12 rounded-xl border border-border bg-surface-2/50 text-text-secondary flex flex-col items-center justify-center gap-0.5 cursor-pointer" type="button" title="Sohbete Bağlan" data-state-text="OFF">
                  <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3.65 5.09a2 2 0 0 1 2.1-1.2l3.15.35a2 2 0 0 1 1.7 1.44l.73 2.58a2 2 0 0 1-.57 1.95l-1.2 1.2a14.3 14.3 0 0 0 4.03 4.03l1.2-1.2a2 2 0 0 1 1.95-.57l2.58.73a2 2 0 0 1 1.44 1.7l.35 3.15a2 2 0 0 1-1.2 2.1 6.65 6.65 0 0 1-2.73.6C8.91 22 2 15.09 2 6.82c0-.95.2-1.87.6-2.73a1 1 0 0 1 1.05-.6Zm-.35 15.21a1 1 0 0 0 1.4 1.4l16-16a1 1 0 0 0-1.4-1.4l-16 16Z" />
                  </svg>
                  <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3.65 5.09a2 2 0 0 1 2.1-1.2l3.15.35a2 2 0 0 1 1.7 1.44l.73 2.58a2 2 0 0 1-.57 1.95l-1.2 1.2a14.3 14.3 0 0 0 4.03 4.03l1.2-1.2a2 2 0 0 1 1.95-.57l2.58.73a2 2 0 0 1 1.44 1.7l.35 3.15a2 2 0 0 1-1.2 2.1 6.65 6.65 0 0 1-2.73.6C8.91 22 2 15.09 2 6.82c0-.95.2-1.87.6-2.73a1 1 0 0 1 1.05-.6Z" />
                  </svg>
                  <span id="quickConnectionLabel" class="sr-only">Sohbete Bağlan</span>
                </button>
              </div>
            </section>
          </aside>

          <!-- ─── Stage (Main Content) ─── -->
          <section class="stage-area min-h-0 overflow-auto bg-surface-0/40 p-5" aria-label="Ana Çalışma Alanı">

            <!-- Lobby Page -->
            <section id="lobbyPage" class="stage-page min-h-0 h-full">
              <div class="lobby-stage-shell h-full min-h-0">
                <section class="lobby-stage-main min-h-0">
                  <strong id="memberCount" class="hidden">0</strong>
                  <div id="participantGrid" class="participant-stage-grid participant-stage-grid--full h-full"></div>
                  <div id="participantHoverControls" class="participant-hover-controls" aria-label="Sahne Kontrolleri">
                    <button class="participant-hover-control" type="button" data-quick-control="mic" title="Mikrofon" aria-label="Mikrofon">
                      <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm5-3a1 1 0 0 1 2 0 7 7 0 0 1-6 6.93V20h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0Z" />
                      </svg>
                      <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M18.9 17.5A7 7 0 0 1 13 19.93V22h3a1 1 0 1 1 0 2H8a1 1 0 0 1 0-2h3v-2.07A7 7 0 0 1 5 13a1 1 0 1 1 2 0 5 5 0 0 0 8.73 3.4ZM15 8v2.17l-6-6V8a3 3 0 0 0 6 0ZM2.3 20.3a1 1 0 1 0 1.4 1.4l18-18a1 1 0 1 0-1.4-1.4l-18 18Z" />
                      </svg>
                    </button>
                    <button class="participant-hover-control" type="button" data-quick-control="camera" title="Kamera" aria-label="Kamera">
                      <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M17 7a2 2 0 0 1 2 2v1.18l2.22-1.33A1 1 0 0 1 23 9.7v4.6a1 1 0 0 1-1.78.85L19 13.82V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h12Z" />
                      </svg>
                      <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M17 7a2 2 0 0 1 2 2v1.18l2.22-1.33A1 1 0 0 1 23 9.7v4.6a1 1 0 0 1-1.78.85L19 13.82V15a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h12Zm-13.7 13.3a1 1 0 0 0 1.4 1.4l16-16a1 1 0 1 0-1.4-1.4l-16 16Z" />
                      </svg>
                    </button>
                    <button class="participant-hover-control" type="button" data-quick-control="screen" title="Ekran Paylaşımı" aria-label="Ekran Paylaşımı">
                      <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v1h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2v-1H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v9h16V7H4Z" />
                      </svg>
                      <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M4 5h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-5v1h2a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h2v-1H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 2v9h16V7H4Zm-.7 13.3a1 1 0 0 0 1.4 1.4l18-18a1 1 0 1 0-1.4-1.4l-18 18Z" />
                      </svg>
                    </button>
                    <button class="participant-hover-control" type="button" data-quick-control="headphone" title="Kulaklık" aria-label="Kulaklık">
                      <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 4a8 8 0 0 0-8 8v4a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H6v-1a6 6 0 1 1 12 0v1h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-4a8 8 0 0 0-8-8Z" />
                      </svg>
                      <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M12 4a8 8 0 0 0-7.69 10.2A3 3 0 0 0 4 15v1a3 3 0 0 0 3 3h1a2 2 0 0 0 2-2v-2.17l-4-4V11a6 6 0 0 1 10.73-3.67l1.43 1.43A7.95 7.95 0 0 0 12 4ZM20 16v-2a8.16 8.16 0 0 0-.4-2.52L22 13.88V16a3 3 0 0 1-3 3h-1a2 2 0 0 1-2-2v-.88l2 2A3 3 0 0 0 20 16Zm-16.7 4.3a1 1 0 0 0 1.4 1.4l16-16a1 1 0 1 0-1.4-1.4l-16 16Z" />
                      </svg>
                    </button>
                    <button class="participant-hover-control participant-hover-control--connection" type="button" data-quick-control="connection" title="Sohbet Bağlantısı" aria-label="Sohbet Bağlantısı">
                      <svg class="icon-on w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3.65 5.09a2 2 0 0 1 2.1-1.2l3.15.35a2 2 0 0 1 1.7 1.44l.73 2.58a2 2 0 0 1-.57 1.95l-1.2 1.2a14.3 14.3 0 0 0 4.03 4.03l1.2-1.2a2 2 0 0 1 1.95-.57l2.58.73a2 2 0 0 1 1.44 1.7l.35 3.15a2 2 0 0 1-1.2 2.1 6.65 6.65 0 0 1-2.73.6C8.91 22 2 15.09 2 6.82c0-.95.2-1.87.6-2.73a1 1 0 0 1 1.05-.6Z" />
                      </svg>
                      <svg class="icon-off w-5 h-5 fill-current" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                        <path d="M3.65 5.09a2 2 0 0 1 2.1-1.2l3.15.35a2 2 0 0 1 1.7 1.44l.73 2.58a2 2 0 0 1-.57 1.95l-1.2 1.2a14.3 14.3 0 0 0 4.03 4.03l1.2-1.2a2 2 0 0 1 1.95-.57l2.58.73a2 2 0 0 1 1.44 1.7l.35 3.15a2 2 0 0 1-1.2 2.1 6.65 6.65 0 0 1-2.73.6C8.91 22 2 15.09 2 6.82c0-.95.2-1.87.6-2.73a1 1 0 0 1 1.05-.6Zm-.35 15.21a1 1 0 0 0 1.4 1.4l16-16a1 1 0 0 0-1.4-1.4l-16 16Z" />
                      </svg>
                    </button>
                  </div>
                </section>

                <aside class="lobby-chat-panel" aria-label="Lobi Mesajlaşma">
                  <header class="lobby-chat-header">
                    <h3 class="lobby-chat-title">Lobi Sohbeti</h3>
                    <p class="lobby-chat-subtitle">Mesajlar anlık güncellenir</p>
                  </header>
                  <ol id="lobbyChatList" class="lobby-chat-list" aria-live="polite"></ol>
                  <form id="lobbyChatForm" class="lobby-chat-form">
                    <label for="lobbyChatInput" class="sr-only">Mesaj</label>
                    <textarea id="lobbyChatInput" class="lobby-chat-input" rows="2" maxlength="1200" placeholder="Lobiye mesaj yaz"></textarea>
                    <button id="lobbyChatSendButton" class="btn-primary lobby-chat-send" type="submit">Gönder</button>
                  </form>
                </aside>
              </div>
            </section>

            <!-- Users Page -->
            <section id="usersPage" class="stage-page hidden flex flex-col gap-4">
              <section class="rounded-2xl border border-border bg-surface-2/30 p-5 glass-subtle">
                <h2 class="text-xs font-bold tracking-[0.1em] uppercase text-text-secondary m-0">Arkadaş Listesi</h2>
                <p class="mt-1 text-text-muted text-xs">Uygulamadaki kullanıcıları ve şu an çevrimiçi olup olmadıklarını buradan görebilirsin.</p>
                <ul id="usersDirectoryList" class="list-none mt-4 p-0 flex flex-col gap-2"></ul>
              </section>
            </section>

            <!-- Settings Page -->
            <section id="settingsPage" class="stage-page hidden">
              <div class="flex flex-col gap-4 max-w-2xl">

                <!-- Profile -->
                <section id="settingsPanelProfile" class="rounded-2xl border border-border bg-surface-2/30 p-5 glass-subtle">
                  <h2 class="text-xs font-bold tracking-[0.1em] uppercase text-text-secondary m-0">Profil Düzenleme</h2>
                  <p class="mt-1 text-text-muted text-xs mb-4">Görünen profil bilgilerini bu alandan güncelleyebilirsin.</p>
                  <form id="profileForm" class="flex flex-col gap-3">
                    <label class="text-text-muted text-xs font-medium" for="profileDisplayName">Görünen Ad</label>
                    <input id="profileDisplayName" type="text" minlength="3" maxlength="32" placeholder="Görünen ad" required />
                    <label class="text-text-muted text-xs font-medium" for="profileEmail">E-Posta</label>
                    <input id="profileEmail" type="email" maxlength="120" placeholder="ornek@domain.com" />
                    <label class="text-text-muted text-xs font-medium" for="profileBio">Hakkında</label>
                    <textarea id="profileBio" rows="4" maxlength="240" placeholder="Kısa bir profil açıklaması"></textarea>
                    <button id="profileSave" class="btn-primary" type="submit">Profili Kaydet</button>
                  </form>
                </section>

                <!-- Security -->
                <section id="settingsPanelSecurity" class="rounded-2xl border border-border bg-surface-2/30 p-5 glass-subtle hidden">
                  <h2 class="text-xs font-bold tracking-[0.1em] uppercase text-text-secondary m-0">Güvenlik</h2>
                  <p class="mt-1 text-text-muted text-xs mb-4">Şifre değişikliği işlemini güvenli şekilde tamamla.</p>
                  <form id="passwordForm" class="flex flex-col gap-3">
                    <label class="text-text-muted text-xs font-medium" for="currentPassword">Mevcut Şifre</label>
                    <input id="currentPassword" type="password" minlength="8" required />
                    <label class="text-text-muted text-xs font-medium" for="newPassword">Yeni Şifre</label>
                    <input id="newPassword" type="password" minlength="8" required />
                    <label class="text-text-muted text-xs font-medium" for="confirmPassword">Yeni Şifre (Tekrar)</label>
                    <input id="confirmPassword" type="password" minlength="8" required />
                    <button id="passwordSave" class="btn-primary" type="submit">Şifreyi Güncelle</button>
                  </form>
                </section>

                <!-- Voice -->
                <section id="settingsPanelVoice" class="rounded-2xl border border-border bg-surface-2/30 p-5 glass-subtle hidden">
                  <h2 class="text-xs font-bold tracking-[0.1em] uppercase text-text-secondary m-0">Ses Ayarları</h2>
                  <p class="mt-1 text-text-muted text-xs mb-4">Mikrofon, çıkış sesi ve konuşma algılama ayarlarını buradan yönetebilirsin.</p>
                  <p class="status-text m-0 rounded-xl border border-border bg-surface-2/50 px-4 py-2.5 text-text-secondary text-sm" id="voiceState">Ses beklemede</p>

                  <div class="flex items-center justify-between gap-3 mt-4">
                    <span class="text-text-muted text-xs font-medium">Arayüz Sesleri</span>
                    <button id="uiSoundsToggle" class="settings-switch" type="button" role="switch" aria-checked="true" aria-label="Arayüz Sesleri"></button>
                  </div>

                  <div class="flex items-center justify-between gap-3 mt-3">
                    <div class="min-w-0">
                      <span class="text-text-muted text-xs font-medium block">RNNoise Gürültü Engelleme</span>
                      <p class="m-0 mt-1 text-[11px] text-text-muted leading-snug">Arka plan gürültüsünü profesyonel kalite ayarları ile azaltır.</p>
                    </div>
                    <button id="rnnoiseToggle" class="settings-switch" type="button" role="switch" aria-checked="true" aria-label="RNNoise Gürültü Engelleme"></button>
                  </div>

                  <label class="text-text-muted text-xs font-medium mt-4 block" for="microphoneSelect">Mikrofon</label>
                  <select id="microphoneSelect" class="mt-1"></select>

                  <div class="grid grid-cols-2 gap-2 mt-4">
                    <button id="micTestToggle" class="btn-secondary text-xs h-10" type="button">Ses Testini Başlat</button>
                  </div>

                  <label class="mt-4 block text-text-muted text-xs font-medium" for="outputVolume">Kulaklık Ses Seviyesi: <strong id="outputVolumeValue" class="text-text-primary">100%</strong></label>
                  <input id="outputVolume" class="mt-1 w-full ct-range" type="range" min="0" max="100" step="1" value="100" />

                  <label class="mt-4 block text-text-muted text-xs font-medium" for="inputGain">Mikrofon Ses Kazancı: <strong id="inputGainValue" class="text-text-primary">100%</strong></label>
                  <input id="inputGain" class="mt-1 w-full ct-range" type="range" min="0" max="200" step="1" value="100" />

                  <label class="text-text-muted text-xs font-medium mt-4 block" for="speakingThresholdMode">Ses Algılama Modu</label>
                  <select id="speakingThresholdMode" class="mt-1">
                    <option value="auto">Otomatik</option>
                    <option value="manual">Manuel</option>
                  </select>

                  <label class="mt-4 block text-text-muted text-xs font-medium" for="speakingThreshold">Konuşma Eşiği: <strong id="speakingThresholdValue" class="text-text-primary">Otomatik</strong></label>
                  <input id="speakingThreshold" class="ct-range" type="range" min="1" max="100" step="1" value="24" />
                  <p id="speakingThresholdHint" class="mt-1 text-text-muted text-[11px] leading-snug">Otomatik mod, ortam gürültüsüne göre eşiği canlı ayarlar.</p>

                  <div id="remoteAudioContainer" class="mt-4 flex flex-col gap-2"></div>
                </section>

                <!-- Camera -->
                <section id="settingsPanelCamera" class="rounded-2xl border border-border bg-surface-2/30 p-5 glass-subtle hidden">
                  <h2 class="text-xs font-bold tracking-[0.1em] uppercase text-text-secondary m-0">Kamera Ayarları</h2>
                  <p class="mt-1 text-text-muted text-xs mb-4">Kamera görüntü kalitesini ve test önizlemesini bu bölümden yönet.</p>

                  <div class="rounded-xl border border-border bg-surface-2/40 p-3 space-y-3">
                    <div class="grid grid-cols-2 gap-2">
                      <div>
                        <label class="text-text-muted text-xs font-medium block" for="cameraResolutionSelect">Çözünürlük</label>
                        <select id="cameraResolutionSelect" class="mt-1">
                          <option value="640x360">640x360</option>
                          <option value="1280x720" selected>1280x720</option>
                          <option value="1920x1080">1920x1080</option>
                        </select>
                      </div>
                      <div>
                        <label class="text-text-muted text-xs font-medium block" for="cameraFpsSelect">FPS</label>
                        <select id="cameraFpsSelect" class="mt-1">
                          <option value="24">24 FPS</option>
                          <option value="30" selected>30 FPS</option>
                          <option value="60">60 FPS</option>
                        </select>
                      </div>
                    </div>
                    <button id="cameraTestToggle" class="btn-secondary text-xs h-10" type="button">Kamera Testini Başlat</button>
                    <video id="cameraTestPreview" class="media-preview-video media-preview-video--camera" autoplay playsinline muted></video>
                  </div>
                </section>

                <!-- Broadcast -->
                <section id="settingsPanelBroadcast" class="rounded-2xl border border-border bg-surface-2/30 p-5 glass-subtle hidden">
                  <h2 class="text-xs font-bold tracking-[0.1em] uppercase text-text-secondary m-0">Yayın Ayarları</h2>
                  <p class="mt-1 text-text-muted text-xs mb-4">Ekran paylaşımı ve yayın kalite seçeneklerini bu bölümde ayarlayabilirsin.</p>

                  <div class="rounded-xl border border-border bg-surface-2/40 p-3 space-y-3">
                    <div class="grid grid-cols-3 gap-2">
                      <div>
                        <label class="text-text-muted text-xs font-medium block" for="screenShareModeSelect">Paylaşım Türü</label>
                        <select id="screenShareModeSelect" class="mt-1">
                          <option value="any" selected>Herhangi</option>
                          <option value="screen">Tüm Ekran</option>
                          <option value="window">Pencere</option>
                        </select>
                      </div>
                      <div>
                        <label class="text-text-muted text-xs font-medium block" for="screenResolutionSelect">Çözünürlük</label>
                        <select id="screenResolutionSelect" class="mt-1">
                          <option value="1280x720">1280x720</option>
                          <option value="1920x1080" selected>1920x1080</option>
                          <option value="2560x1440">2560x1440</option>
                        </select>
                      </div>
                      <div>
                        <label class="text-text-muted text-xs font-medium block" for="screenFpsSelect">FPS</label>
                        <select id="screenFpsSelect" class="mt-1">
                          <option value="15">15 FPS</option>
                          <option value="30" selected>30 FPS</option>
                          <option value="60">60 FPS</option>
                        </select>
                      </div>
                    </div>
                    <button id="screenTestToggle" class="btn-secondary text-xs h-10" type="button">Ekran Testini Başlat</button>
                    <video id="screenTestPreview" class="media-preview-video media-preview-video--screen" autoplay playsinline muted></video>

                    <div class="media-debug-log-card rounded-xl border border-border bg-surface-2/55 p-3">
                      <div class="media-debug-log-toolbar">
                        <h3 class="media-debug-log-title m-0">Kamera & Yayın Logları</h3>
                        <div class="media-debug-log-actions">
                          <button id="mediaDebugCopyButton" class="btn-secondary h-8 px-3 text-[11px]" type="button">Logları Kopyala</button>
                          <button id="mediaDebugClearButton" class="btn-secondary h-8 px-3 text-[11px]" type="button">Logları Temizle</button>
                        </div>
                      </div>
                      <p class="media-debug-log-hint m-0 mt-1">Kamera ve ekran yayını sırasında kullanılan kalite profilleri, fallback denemeleri, bitrate/FPS ve LiveKit yayın olayları burada tutulur.</p>
                      <pre id="mediaDebugLogOutput" class="media-debug-log-output" aria-live="polite">Loglar yükleniyor...</pre>
                    </div>
                  </div>
                </section>

                <!-- Session -->
                <section id="settingsPanelSession" class="rounded-2xl border border-border bg-surface-2/30 p-5 glass-subtle hidden">
                  <h2 class="text-xs font-bold tracking-[0.1em] uppercase text-text-secondary m-0">Oturum</h2>
                  <p class="mt-1 text-text-muted text-xs mb-4">Hesap oturumunu ve masaüstü davranışlarını bu alandan yönetebilirsin.</p>

                  <div class="space-y-3 mb-4">
                    <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
                      <div>
                        <p class="m-0 text-sm font-medium text-text-primary">Kapatınca Sistem Tepsisine Gönder</p>
                        <p class="m-0 mt-0.5 text-[11px] text-text-muted">Kapat tuşu uygulamayı tamamen kapatmak yerine gizler.</p>
                      </div>
                      <button id="closeToTrayToggle" class="settings-switch" type="button" role="switch" aria-checked="false" aria-label="Kapatınca Sistem Tepsisine Gönder"></button>
                    </div>

                    <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
                      <div>
                        <p class="m-0 text-sm font-medium text-text-primary">Başlangıçta Çalıştır</p>
                        <p class="m-0 mt-0.5 text-[11px] text-text-muted">Windows açıldığında uygulama otomatik başlatılır.</p>
                      </div>
                      <button id="launchAtStartupToggle" class="settings-switch" type="button" role="switch" aria-checked="false" aria-label="Başlangıçta Çalıştır"></button>
                    </div>

                    <div class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2/50 px-3 py-2.5">
                      <div>
                        <p class="m-0 text-sm font-medium text-text-primary">GPU Hızlandırma</p>
                        <p class="m-0 mt-0.5 text-[11px] text-text-muted">Daha akıcı kamera ve yayın işleme sağlar. Değişiklik için uygulamayı yeniden başlatman gerekir.</p>
                      </div>
                      <button id="gpuAccelerationToggle" class="settings-switch" type="button" role="switch" aria-checked="false" aria-label="GPU Hızlandırma"></button>
                    </div>

                    <div class="flex items-center justify-end">
                      <button id="gpuRestartButton" class="btn-primary h-9 px-4 text-xs" type="button">Şimdi Yeniden Başlat</button>
                    </div>
                  </div>

                  <section id="settingsUpdatesCard" class="settings-updates-card mb-4 rounded-xl border border-border bg-surface-2/50 px-3 py-3">
                    <h3 class="m-0 text-sm font-medium text-text-primary">Güncellemeler</h3>
                    <p class="m-0 mt-1 text-[11px] text-text-muted">İstemci sürümünü buradan kontrol edebilir ve yeni sürüme geçebilirsin.</p>

                    <p id="settingsUpdateSummary" class="settings-update-summary m-0 mt-3">Güncelleme durumu hazırlanıyor...</p>
                    <p id="settingsUpdateMeta" class="settings-update-meta m-0 mt-1">-</p>

                    <div class="mt-3 flex flex-wrap items-center gap-2">
                      <button id="settingsUpdateCheckButton" class="btn-secondary h-9 text-xs" type="button">Güncelleme Kontrol Et</button>
                      <button id="settingsUpdateInstallButton" class="btn-primary h-9 text-xs hidden" type="button">Güncelle</button>
                    </div>

                    <details id="settingsUpdateErrorContainer" class="settings-update-error hidden mt-3">
                      <summary>Hata detayları</summary>
                      <pre id="settingsUpdateErrorDetails" class="m-0 mt-2"></pre>
                    </details>
                  </section>

                  <div class="max-w-[220px]">
                    <button id="logoutButton" class="btn-danger w-full" type="button">Çıkış Yap</button>
                  </div>
                </section>
              </div>
            </section>
          </section>
        </div>
      </section>

      <section id="screenShareModal" class="capture-modal hidden" aria-hidden="true">
        <div class="capture-modal-panel rounded-2xl border border-border bg-surface-1 glass-heavy p-4">
          <div class="flex items-center justify-between gap-2 mb-3">
            <h3 id="shareModalTitle" class="m-0 text-sm font-semibold text-text-primary">Ekran Paylaşımı Seçimi</h3>
            <button id="screenShareModalClose" class="btn-secondary h-9 px-3 text-xs" type="button">Kapat</button>
          </div>

          <div id="screenCaptureFilters" class="mb-3 space-y-3">
            <div class="capture-tab-row" role="tablist" aria-label="Ekran kaynak türü">
              <button id="screenCaptureTabMonitors" class="capture-tab-button active" type="button" role="tab" aria-selected="true">Monitörler</button>
              <button id="screenCaptureTabWindows" class="capture-tab-button" type="button" role="tab" aria-selected="false">Pencereler</button>
            </div>

            <div class="grid grid-cols-4 gap-2">
              <div>
                <label class="text-text-muted text-xs font-medium block" for="modalScreenResolutionSelect">Çözünürlük</label>
                <select id="modalScreenResolutionSelect" class="mt-1">
                  <option value="1280x720">1280x720</option>
                  <option value="1920x1080" selected>1920x1080</option>
                  <option value="2560x1440">2560x1440</option>
                </select>
              </div>
              <div>
                <label class="text-text-muted text-xs font-medium block" for="modalScreenFpsSelect">FPS</label>
                <select id="modalScreenFpsSelect" class="mt-1">
                  <option value="15">15 FPS</option>
                  <option value="30" selected>30 FPS</option>
                  <option value="60">60 FPS</option>
                </select>
              </div>
              <div>
              <label class="text-text-muted text-xs font-medium block" for="screenMonitorSelect">Monitör</label>
              <select id="screenMonitorSelect" class="mt-1">
                <option value="all" selected>Tümü</option>
              </select>
              </div>
              <div class="flex items-end">
                <button id="screenCaptureRefreshButton" class="btn-secondary h-10 text-xs w-full" type="button">Kaynakları Yenile</button>
              </div>
            </div>
          </div>

          <div class="capture-preview-panel mb-3 rounded-xl border border-border bg-surface-2/40 p-3">
            <p id="sharePreviewHint" class="m-0 mb-2 text-xs text-text-muted">Önizleme hazırlanıyor...</p>
            <img id="sharePreviewImage" class="capture-preview-image hidden" alt="Paylaşım önizlemesi" />
            <video id="sharePreviewVideo" class="capture-preview-video hidden" autoplay playsinline muted></video>
          </div>

          <div id="screenCaptureSourceList" class="capture-source-grid"></div>

          <div class="flex items-center justify-end gap-2 mt-4">
            <button id="screenShareModalCancel" class="btn-secondary h-10 px-4 text-xs" type="button">İptal</button>
            <button id="screenShareModalConfirm" class="btn-primary h-10 px-4 text-xs" type="button">Paylaşımı Başlat</button>
          </div>
        </div>
      </section>

      <section id="participantAudioMenu" class="participant-audio-menu hidden" aria-hidden="true" role="dialog" aria-label="Katılımcı ses ayarları">
        <div class="participant-audio-menu-title-row">
          <h3 id="participantAudioMenuTitle" class="participant-audio-menu-title">Ses Ayarları</h3>
        </div>
        <button id="participantAudioMuteToggle" class="participant-audio-menu-action" type="button">Bu kullanıcıyı sustur</button>
        <label class="participant-audio-menu-label" for="participantAudioVolumeSlider">Ses seviyesi <strong id="participantAudioVolumeValue">100%</strong></label>
        <input id="participantAudioVolumeSlider" class="participant-audio-menu-slider ct-range" type="range" min="0" max="200" step="1" value="100" />
        <div class="participant-audio-menu-presets">
          <button id="participantAudioPreset100" class="participant-audio-menu-preset" type="button">100%</button>
          <button id="participantAudioPreset150" class="participant-audio-menu-preset" type="button">150%</button>
          <button id="participantAudioPreset200" class="participant-audio-menu-preset" type="button">200%</button>
        </div>
      </section>

      <section id="toastContainer" class="toast-stack" aria-live="polite" aria-atomic="false"></section>

    </main>
  `;
};
