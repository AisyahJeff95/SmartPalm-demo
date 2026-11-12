/* ==========================================================================
   SmartPalm Command Center — Shared Top Panel Controller (js/top-panel.js)
   Powers Search (Ctrl+Shift+F), Settings Modal, User Manual Modal,
   Notifications Bell & Right Dropdown, KPSM Dropdown, and Profile/Auth Pill
   across all website pages.
   ========================================================================== */

(function () {
    const LS_NOTIFICATIONS_KEY = 'smartpalm_notifications_v1';
    const LS_RUNS_KEY = 'smartpalm_prediction_runs_v1';

    const FALLBACK_ESTATES = [
        { key: 'BENTA_WAWASAN', name: 'Benta Wawasan (Sabah)', state: 'Sabah', blocksCount: 2568 },
        { key: 'MPOB_KERATONG', name: 'MPOB Kratong', state: 'Pahang', blocksCount: 229 },
        { key: 'GOLD_HILL', name: 'Gold Hill Estate', state: 'Pahang', blocksCount: 162 },
        { key: 'SEBERTAK', name: 'Sebertak Estate', state: 'Pahang', blocksCount: 152 },
        { key: 'FGV_TRIANG', name: 'FGV Triang Selatan', state: 'Pahang', blocksCount: 68 },
        { key: 'MERDEKA', name: 'Merdeka Estate', state: 'Pahang', blocksCount: 67 },
        { key: 'MAKMUR', name: 'Makmur Estate', state: 'Pahang', blocksCount: 66 },
        { key: 'KOMPLEKS_BERA', name: 'Kompleks Bera', state: 'Pahang', blocksCount: 54 },
        { key: 'MPOB_LAHAD_DATU', name: 'MPOB Lahad Datu', state: 'Sabah', blocksCount: 47 },
        { key: 'SRI_TERAP', name: 'Sri Terap Estate', state: 'Johor', blocksCount: 41 },
        { key: 'TERENTANG', name: 'Terentang Estate', state: 'Negeri Sembilan', blocksCount: 37 },
        { key: 'SPOC_J24_LEDANG', name: 'SPOC J24 Ledang', state: 'Johor', blocksCount: 34 },
        { key: 'SUNGAI_TEKAM', name: 'Sungai Tekam', state: 'Pahang', blocksCount: 33 },
        { key: 'MPOB_KLUANG', name: 'MPOB Kluang', state: 'Johor', blocksCount: 31 },
        { key: 'KEJORA', name: 'Kejora Estate', state: 'Johor', blocksCount: 25 },
        { key: 'JENGKA_24', name: 'Jengka 24', state: 'Pahang', blocksCount: 20 },
        { key: 'MPOB_UKM', name: 'MPOB UKM Bangi', state: 'Selangor', blocksCount: 19 },
        { key: 'MPOB_SESSANG', name: 'MPOB Sessang', state: 'Sarawak', blocksCount: 14 },
        { key: 'MPOB_HULU_PADAS', name: 'MPOB Hulu Padas', state: 'Sabah', blocksCount: 9 },
        { key: 'MPOB_BELAGA', name: 'MPOB Belaga', state: 'Sarawak', blocksCount: 2 }
    ];

    function getCatalog() {
        return (window.SMARTPALM_ESTATE_CATALOG && window.SMARTPALM_ESTATE_CATALOG.length)
            ? window.SMARTPALM_ESTATE_CATALOG
            : FALLBACK_ESTATES;
    }

    function formatTopPanelRunTime(tsStr, folderName, mtime) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const toMYT = (d) => {
            const myt = new Date(d.getTime() + 8 * 60 * 60 * 1000);
            const day = String(myt.getUTCDate()).padStart(2, '0');
            const mon = months[myt.getUTCMonth()];
            const yr = myt.getUTCFullYear();
            const hh = String(myt.getUTCHours()).padStart(2, '0');
            const mm = String(myt.getUTCMinutes()).padStart(2, '0');
            return { time: `${hh}:${mm}`, date: `${day} ${mon} ${yr}` };
        };
        const fnMatch = String(folderName || '').match(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/);
        if (fnMatch) {
            const d = new Date(Date.UTC(+fnMatch[1], +fnMatch[2] - 1, +fnMatch[3], +fnMatch[4], +fnMatch[5], +fnMatch[6]));
            if (!isNaN(d.getTime())) return toMYT(d);
        }
        const raw = String(tsStr || '').trim();
        if (raw) {
            const iso = new Date(raw);
            if (!isNaN(iso.getTime()) && (raw.endsWith('Z') || raw.includes('+'))) return toMYT(iso);
            const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})[_T\s](\d{2}):?(\d{2})(?::?(\d{2}))?/);
            if (m) {
                const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)));
                if (!isNaN(d.getTime())) return toMYT(d);
            }
        }
        if (mtime && Number(mtime) > 1000000000) {
            const d = new Date(Number(mtime) * 1000);
            if (!isNaN(d.getTime())) return toMYT(d);
        }
        return { time: '—', date: 'Recent Run' };
    }

    function getRuns() {
        const activeStorageGroup = typeof window.getCurrentPalmnexStorageGroup === 'function'
            ? window.getCurrentPalmnexStorageGroup()
            : 'storage_all';
        const isClientPrivateStorage = (activeStorageGroup && activeStorageGroup !== 'storage_all');

        const live = Array.isArray(window.PREDICTION_RUN_HISTORY) ? window.PREDICTION_RUN_HISTORY : [];
        let lsV2 = [];
        try {
            const rawV2 = localStorage.getItem('smartpalm_prediction_history_meta_v2');
            if (rawV2) lsV2 = JSON.parse(rawV2) || [];
        } catch (e) {}

        const combined = [...live, ...lsV2];
        const seen = new Set();
        const result = [];
        combined.forEach(r => {
            if (!r) return;
            const folder = r.folderName || r.folder_name;
            if (!folder || seen.has(folder)) return;
            if (isClientPrivateStorage) {
                const runGroup = r.storageGroup || r.storage_group || '';
                if (runGroup !== activeStorageGroup) return;
            }
            seen.add(folder);
            const dt = formatTopPanelRunTime(r.timestamp, folder, r.mtime);
            result.push({
                id: `run-${folder}`,
                folderName: folder,
                estateKey: r.shpKey || r.estate_key || r.estateName || '',
                estateName: r.estateName || r.estate_name || folder,
                date: dt.date,
                time: dt.time,
                storageLocation: `outputs/${folder}`
            });
        });
        return result;
    }

    function getAllNotificationsShared() {
        let savedState = {};
        try {
            const raw = localStorage.getItem(LS_NOTIFICATIONS_KEY);
            if (raw) savedState = JSON.parse(raw) || {};
        } catch (e) {}

        const readMap = savedState.readMap || {};
        const runs = getRuns();

        const items = [
            {
                id: 'notif-profile-update',
                type: 'profile',
                titleHtml: '<b>Please update your profile</b> — verify your estate organization details and contact email.',
                estateName: 'Account Settings',
                time: 'Action Required',
                date: 'Account Profile',
                savedIn: 'Supabase Profile • Palmnex Sdn Bhd',
                unread: readMap['notif-profile-update'] !== undefined ? !readMap['notif-profile-update'] : true,
                actionType: 'profile'
            }
        ];

        runs.forEach((r, idx) => {
            const notifId = 'notif-run-' + (r.folderName || r.id || idx);
            const whereSaved = r.storageLocation || (`outputs/${r.folderName || 'prediction_run'}`);
            items.push({
                id: notifId,
                type: 'run',
                runId: r.id,
                estateKey: r.estateKey,
                estateName: r.estateName,
                time: r.time || '—',
                date: r.date || 'Recent Run',
                savedIn: whereSaved,
                titleHtml: `Run for <b>${r.estateName}</b> completed at <b>${r.time}</b>, <b>${r.date}</b>, saved in <b>${whereSaved}</b>`,
                unread: readMap[notifId] !== undefined ? !readMap[notifId] : (idx < 4),
                actionType: 'run'
            });
        });

        return items;
    }

    function saveNotificationsStateShared(readMap) {
        try {
            localStorage.setItem(LS_NOTIFICATIONS_KEY, JSON.stringify({ readMap }));
        } catch (e) {}
    }

    function renderTopNotificationDropdownShared() {
        const listEl = document.getElementById('sp-top-notif-dropdown-list');
        const badgeEl = document.getElementById('sp-top-notif-badge');
        const pillEl = document.getElementById('sp-notif-dd-unread-pill');
        if (!listEl) return;

        const items = getAllNotificationsShared();
        const unreadCount = items.filter(i => i.unread).length;

        if (badgeEl) {
            badgeEl.textContent = unreadCount;
            badgeEl.style.display = unreadCount > 0 ? 'flex' : 'none';
        }
        if (pillEl) {
            pillEl.textContent = `${unreadCount} New`;
        }

        listEl.innerHTML = items.slice(0, 6).map(item => {
            const iconSvg = item.type === 'profile'
                ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
                : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;

            return `
                <div class="sp-notif-dd-item ${item.unread ? 'unread' : ''}" onclick="handleTopNotifItemClick('${item.id}')">
                    <div class="sp-notif-dd-icon ${item.type}">
                        ${iconSvg}
                    </div>
                    <div class="sp-notif-dd-body">
                        <div class="sp-notif-dd-text">${item.titleHtml}</div>
                        <div class="sp-notif-dd-sub">
                            <span>${item.date} • ${item.time}</span>
                            <span style="color:#38bdf8;font-weight:600;">Open →</span>
                        </div>
                    </div>
                    ${item.unread ? '<span class="sp-notif-dd-dot" title="Unread"></span>' : ''}
                </div>
            `;
        }).join('');
    }

    // Export notification functions if not already provided by home_dashboard.js
    if (typeof window.getAllNotifications !== 'function') {
        window.getAllNotifications = getAllNotificationsShared;
    }
    if (typeof window.renderTopNotificationDropdown !== 'function') {
        window.renderTopNotificationDropdown = renderTopNotificationDropdownShared;
    }
    if (typeof window.toggleTopNotifDropdown !== 'function') {
        window.toggleTopNotifDropdown = function (event) {
            if (event) event.stopPropagation();
            const dd = document.getElementById('sp-top-notif-dropdown');
            if (!dd) return;
            const isOpen = dd.classList.toggle('open');
            if (isOpen) {
                renderTopNotificationDropdownShared();
            }
        };
    }
    if (typeof window.markAllNotificationsRead !== 'function') {
        window.markAllNotificationsRead = function (event) {
            if (event) event.stopPropagation();
            const items = getAllNotificationsShared();
            const readMap = {};
            items.forEach(i => { readMap[i.id] = true; });
            saveNotificationsStateShared(readMap);
            renderTopNotificationDropdownShared();
            if (typeof window.renderFullNotificationsPage === 'function') {
                window.renderFullNotificationsPage();
            }
        };
    }
    if (typeof window.handleTopNotifItemClick !== 'function') {
        window.handleTopNotifItemClick = function (notifId) {
            let savedState = {};
            try {
                const raw = localStorage.getItem(LS_NOTIFICATIONS_KEY);
                if (raw) savedState = JSON.parse(raw) || {};
            } catch (e) {}
            const readMap = savedState.readMap || {};
            readMap[notifId] = true;
            saveNotificationsStateShared(readMap);
            renderTopNotificationDropdownShared();

            const dd = document.getElementById('sp-top-notif-dropdown');
            if (dd) dd.classList.remove('open');

            if (notifId === 'notif-profile-update') {
                if (typeof window.openAuthModal === 'function') {
                    window.openAuthModal('signin');
                    return;
                }
            }
            window.location.href = `notifications.html?id=${encodeURIComponent(notifId)}`;
        };
    }

    if (typeof window.toggleAuthPasswordVisibility !== 'function') {
        window.toggleAuthPasswordVisibility = function (inputId = 'signin-password', iconId = 'icon-eye-signin-password') {
            const input = document.getElementById(inputId);
            const icon = document.getElementById(iconId);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            if (icon) {
                if (isPassword) {
                    icon.innerHTML = `
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                    `;
                    icon.style.color = '#34d399';
                } else {
                    icon.innerHTML = `
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                    `;
                    icon.style.color = '#94a3b8';
                }
            }
        };
    }

    // Inject missing modals (#sp-settings-modal, #manual-modal, #auth-modal) and Clock History button so buttons work on every page
    function ensureTopPanelModals() {
        const rightControls = document.querySelector('.sp-top-right-controls');
        if (rightControls && !document.getElementById('sp-top-history-btn')) {
            const histBtn = document.createElement('a');
            histBtn.href = 'notifications.html?filter=runs';
            histBtn.target = '_blank';
            histBtn.className = 'sp-icon-btn';
            histBtn.id = 'sp-top-history-btn';
            histBtn.title = 'Run History';
            histBtn.style.textDecoration = 'none';
            histBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
            const notifWrap = document.getElementById('sp-notif-dropdown-wrap');
            if (notifWrap && notifWrap.parentNode === rightControls) {
                rightControls.insertBefore(histBtn, notifWrap);
            } else {
                rightControls.appendChild(histBtn);
            }
        }

        if (!document.getElementById('sp-settings-modal')) {
            const settingsDiv = document.createElement('div');
            settingsDiv.id = 'sp-settings-modal';
            settingsDiv.className = 'modal-overlay';
            settingsDiv.style.cssText = 'display: none; align-items: center; justify-content: center; z-index: 9999999; position: fixed; inset: 0; background: rgba(0,0,0,0.68); backdrop-filter: blur(6px);';
            settingsDiv.innerHTML = `
                <div class="modal-content" style="max-width: 460px; width: 90%; background: #141922; color: #f8fafc; border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 24px; position: relative; box-shadow: 0 24px 60px rgba(0,0,0,0.75); font-family: 'Inter', sans-serif;">
                    <button type="button" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer;" onclick="document.getElementById('sp-settings-modal').style.display='none'">✕</button>
                    <h3 style="margin: 0 0 12px 0; font-family: 'Outfit', sans-serif; font-size: 19px; color: #ffffff;">System Settings</h3>
                    <div style="font-size: 13px; color: #cbd5e1; display: flex; flex-direction: column; gap: 14px;">
                        <div>
                            <label style="display:block;font-weight:600;margin-bottom:4px;color:#cbd5e1;">Weekly Prediction Quota Limit</label>
                            <input type="number" id="sp-setting-weekly-max" class="sp-sched-input" value="20" min="5" max="100" onchange="localStorage.setItem('smartpalm_weekly_quota_max_v1', this.value);" />
                        </div>
                        <div>
                            <label style="display:block;font-weight:600;margin-bottom:4px;color:#cbd5e1;">Default Map Basemap</label>
                            <div style="display:flex;gap:8px;">
                                <button type="button" class="sp-sched-btn" onclick="if(typeof spToggleBasemap==='function') spToggleBasemap('sat'); document.getElementById('sp-settings-modal').style.display='none';">Dark Satellite</button>
                                <button type="button" class="sp-sched-btn" style="background:#334155;" onclick="if(typeof spToggleBasemap==='function') spToggleBasemap('vec'); document.getElementById('sp-settings-modal').style.display='none';">Dark Vector</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(settingsDiv);
        }

        if (!document.getElementById('manual-modal')) {
            const manualDiv = document.createElement('div');
            manualDiv.id = 'manual-modal';
            manualDiv.className = 'modal-overlay';
            manualDiv.style.cssText = 'display: none; align-items: center; justify-content: center; z-index: 9999999; position: fixed; inset: 0; background: rgba(0,0,0,0.68); backdrop-filter: blur(6px);';
            manualDiv.innerHTML = `
                <div class="modal-content" style="max-width: 600px; width: 90%; background: #141922; color: #f8fafc; border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 24px; position: relative; box-shadow: 0 24px 60px rgba(0,0,0,0.75); font-family: 'Inter', sans-serif;">
                    <button type="button" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer;" onclick="document.getElementById('manual-modal').style.display='none'">✕</button>
                    <h3 style="margin-top: 0; font-family: 'Outfit', sans-serif; font-size: 20px; color: #ffffff;">User Manual — SmartPalm Command Center</h3>
                    <div style="font-family: 'Inter', sans-serif; font-size: 13.5px; color: #cbd5e1; line-height: 1.6; max-height: 60vh; overflow-y: auto;">
                        <h4 style="color:#ffffff;">1. Command Center Map (All 20 Comprehensive Boundaries)</h4>
                        <p>Click any estate pin or boundary on the dark map (or select from the Left Panel / Top Search) to zoom to its blocks and inspect its Stress Rating and 3-Month N, P, K, Mg, Ca, B trend.</p>
                        <h4 style="color:#ffffff;">2. Fertilizer Application Schedule &amp; Prediction Reminders</h4>
                        <p>Click <b>+ Schedule Fertilizer</b> in the Right Panel to log your fertilizer application date. SmartPalm automatically schedules the follow-up satellite prediction (+30, +45, or +60 days post-application).</p>
                        <h4 style="color:#ffffff;">3. Comprehensive &amp; Standard Fertilizer Modules</h4>
                        <p>Use the Top Panel pills or Left Sidebar to open Comprehensive Fertilizer, Standard Fertilizer, PalmNexReaDS, or KPSM Monitoring System.</p>
                    </div>
                </div>
            `;
            document.body.appendChild(manualDiv);
        }

        if (typeof window.PALMNEX_REQUIRE_LOGIN === 'undefined') {
            window.PALMNEX_REQUIRE_LOGIN = true;
        }
        if (!document.getElementById('auth-modal')) {
            const authDiv = document.createElement('div');
            authDiv.id = 'auth-modal';
            authDiv.className = 'modal-overlay';
            authDiv.style.cssText = 'display: none; align-items: center; justify-content: center; z-index: 9999999; position: fixed; inset: 0; background: rgba(0,0,0,0.68); backdrop-filter: blur(6px);';
            authDiv.innerHTML = `
                <div class="modal-content" style="max-width: 440px; width: 90%; background: #141922; color: #f8fafc; border: 1px solid rgba(255,255,255,0.14); border-radius: 16px; padding: 24px; position: relative; box-shadow: 0 24px 60px rgba(0,0,0,0.75); font-family: 'Inter', sans-serif;">
                    <button type="button" id="auth-modal-close-btn" style="position: absolute; top: 16px; right: 16px; background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer;" onclick="closeAuthModal()">✕</button>
                    <div style="text-align: center; margin-bottom: 20px;">
                        <h3 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700; color: #ffffff;">Account Access</h3>
                        <p style="margin: 0; font-size: 13px; color: #94a3b8;">Sign in with your PalmnexReaDS username</p>
                    </div>
                    <div id="auth-error-msg" style="display: none; background: rgba(239,68,68,0.15); color: #fca5a5; border: 1px solid #ef4444; padding: 10px; border-radius: 6px; font-size: 12px; margin-bottom: 14px;"></div>
                    <div id="auth-success-msg" style="display: none; background: rgba(16,185,129,0.15); color: #6ee7b7; border: 1px solid #10b981; padding: 10px; border-radius: 6px; font-size: 12px; margin-bottom: 14px;"></div>
                    <form id="auth-form-signin" onsubmit="handleEmailSignIn(event)">
                        <div style="margin-bottom: 12px;">
                            <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #cbd5e1;">PalmnexReaDS Username or Email</label>
                            <input type="text" id="signin-email" required placeholder="e.g. adminbenta1 or admin1@palmnex.com.my" class="sp-sched-input" style="height: 38px; font-size: 13px;" />
                        </div>
                        <div style="margin-bottom: 16px;">
                            <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #cbd5e1;">Password</label>
                            <div style="position: relative; display: flex; align-items: center; width: 100%;">
                                <input type="password" id="signin-password" required placeholder="••••••••" class="sp-sched-input" style="height: 38px; font-size: 13px; width: 100%; padding-right: 38px;" />
                                <button type="button" id="btn-toggle-signin-password" onclick="toggleAuthPasswordVisibility('signin-password', 'icon-eye-signin-password')" title="Show / Hide Password" style="position: absolute; right: 10px; background: none; border: none; color: #94a3b8; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;">
                                    <svg id="icon-eye-signin-password" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#94a3b8;">
                                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                        <circle cx="12" cy="12" r="3"></circle>
                                    </svg>
                                </button>
                            </div>
                        </div>
                        <button type="submit" id="btn-auth-signin" class="sp-sched-btn" style="width: 100%; height: 40px; font-size: 14px;">Sign In</button>
                    </form>
                </div>
            `;
            document.body.appendChild(authDiv);
        }
        const compInput = document.getElementById('signin-company');
        if (compInput && compInput.parentNode) {
            compInput.parentNode.style.display = 'none';
        }
    }

    function renderFallbackSessionBanner() {
        const formSignin = document.getElementById('auth-form-signin');
        if (!formSignin) return;
        let banner = document.getElementById('auth-active-session-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'auth-active-session-banner';
            banner.style.cssText = 'display:none; align-items:center; justify-content:space-between; gap:10px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); padding:10px 12px; border-radius:8px; margin-bottom:14px; font-size:12px; color:#d1fae5;';
            formSignin.parentNode.insertBefore(banner, formSignin);
        }
        const saved = localStorage.getItem('palmnex_user_session');
        if (saved) {
            try {
                const u = JSON.parse(saved);
                const name = u.username || u.user_metadata?.full_name || (u.email ? u.email.split('@')[0] : 'Admin');
                const comp = u.company || u.estate_company || 'Palmnex Sdn Bhd';
                banner.innerHTML = `
                    <div>
                        <div style="font-weight:700; color:#34d399;">Signed in as ${name}</div>
                        <div style="font-size:11px; color:#94a3b8;">${comp}</div>
                    </div>
                    <button type="button" onclick="handleSignOut()" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.45); border-radius:6px; padding:5px 10px; font-size:11px; font-weight:600; cursor:pointer; white-space:nowrap;">Sign Out</button>
                `;
                banner.style.display = 'flex';
                return;
            } catch (e) {}
        }
        banner.style.display = 'none';
    }

    // Fallback auth helpers if js/auth.js is not loaded on the page
    if (typeof window.openAuthModal !== 'function') {
        window.openAuthModal = function () {
            const modal = document.getElementById('auth-modal');
            if (modal) {
                modal.style.display = 'flex';
                const closeBtn = document.getElementById('auth-modal-close-btn') || modal.querySelector('button[onclick*="closeAuthModal"]');
                if (closeBtn) {
                    const hasSession = Boolean(localStorage.getItem('palmnex_user_session'));
                    closeBtn.style.display = (window.PALMNEX_REQUIRE_LOGIN && !hasSession) ? 'none' : 'block';
                }
                renderFallbackSessionBanner();
            }
        };
    }
    if (typeof window.closeAuthModal !== 'function') {
        window.closeAuthModal = function () {
            if (window.PALMNEX_REQUIRE_LOGIN && !localStorage.getItem('palmnex_user_session')) {
                return;
            }
            const modal = document.getElementById('auth-modal');
            if (modal) modal.style.display = 'none';
        };
    }
    if (typeof window.updateTopNavUser !== 'function') {
        window.updateTopNavUser = function (user) {
            const userEmailSpan = document.getElementById('nav-user-email');
            const avatarInitialsEl = document.querySelector('.sp-avatar-circle span:first-child');
            if (!user) {
                if (avatarInitialsEl) avatarInitialsEl.textContent = 'SI';
                if (userEmailSpan) userEmailSpan.textContent = 'Sign In';
                return;
            }
            const rawUsername = (user && (user.username || user.user_metadata?.username || user.user_metadata?.full_name || user.email?.split('@')[0])) || 'Admin';
            const displayName = (rawUsername.toLowerCase() === 'admin1' || rawUsername === 'Lead Agronomist (Admin)') ? 'Admin' : rawUsername;
            const companyName = (user && (user.company || user.estate_company)) || 'Palmnex Sdn Bhd';

            if (avatarInitialsEl) avatarInitialsEl.textContent = displayName.slice(0, 2).toUpperCase();
            if (userEmailSpan) userEmailSpan.textContent = `${displayName} • ${companyName}`;
        };
    }
    if (typeof window.applyModuleAccessControl !== 'function') {
        window.applyModuleAccessControl = function (user) {
            const tier = (user && user.access_tier) ? String(user.access_tier).toUpperCase() : 'C';
            const allowComp = (tier === 'B' || tier === 'C');
            const allowStd = (tier === 'A' || tier === 'C');
            const allowReads = (tier === 'B' || tier === 'C');
            const allowKpsm = (tier === 'C');
            const setElVisible = (el, visible) => {
                if (!el) return;
                if (visible) el.style.removeProperty('display');
                else el.style.setProperty('display', 'none', 'important');
            };
            document.querySelectorAll('.sp-top-nav-pills a.sp-top-pill').forEach(a => {
                const href = (a.getAttribute('href') || '').toLowerCase();
                if (href.includes('comprehensive')) setElVisible(a, allowComp);
                else if (href.includes('standard')) setElVisible(a, allowStd);
                else if (href.includes('palmnex.com.my') || href.includes('palmnexreads')) setElVisible(a, allowReads);
            });
            setElVisible(document.getElementById('sp-top-kpsm-dropdown'), allowKpsm);
            document.querySelectorAll('.cms-sidebar .cms-nav > a.cms-nav-item').forEach(a => {
                const href = (a.getAttribute('href') || '').toLowerCase();
                if (href.includes('comprehensive')) setElVisible(a, allowComp);
                else if (href.includes('standard')) setElVisible(a, allowStd);
                else if (href.includes('palmnex.com.my') || href.includes('palmnexreads')) setElVisible(a, allowReads);
                else if (href.includes('kpsm')) setElVisible(a, allowKpsm);
            });
            document.querySelectorAll('.cms-sidebar .cms-nav .cms-nav-group').forEach(group => {
                setElVisible(group, allowKpsm);
            });
            if (tier === 'A') {
                const path = (window.location.pathname || '').toLowerCase();
                if (path.includes('comprehensive') || path.includes('kpsm')) window.location.replace('standard.html');
            } else if (tier === 'B') {
                const path = (window.location.pathname || '').toLowerCase();
                if (path.includes('standard') || path.includes('kpsm')) window.location.replace('comprehensive.html');
            }
        };
    }
    if (typeof window.handleSignOut !== 'function') {
        window.handleSignOut = async function () {
            const client = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
            if (client && client.auth) {
                try { await client.auth.signOut(); } catch (e) {}
            }
            localStorage.removeItem('palmnex_user_session');
            localStorage.removeItem('reada_logged_in');
            renderFallbackSessionBanner();
            if (window.PALMNEX_REQUIRE_LOGIN !== false) {
                window.updateTopNavUser(null);
                if (typeof window.openAuthModal === 'function') window.openAuthModal('signin');
            } else {
                const defUser = { username: 'Admin', company: 'Palmnex Sdn Bhd', access_tier: 'C', storage_group: 'storage_all', email: 'admin1@palmnex.com.my' };
                window.updateTopNavUser(defUser);
                if (typeof window.applyModuleAccessControl === 'function') window.applyModuleAccessControl(defUser);
            }
        };
    }
    if (typeof window.handleEmailSignIn !== 'function') {
        window.handleEmailSignIn = async function (event) {
            if (event) event.preventDefault();
            const rawInput = document.getElementById('signin-email')?.value?.trim() || 'Admin';
            const companyInput = document.getElementById('signin-company')?.value?.trim() || 'Palmnex Sdn Bhd';
            const password = document.getElementById('signin-password')?.value || '';
            const cleanInput = rawInput.toLowerCase();
            const errEl = document.getElementById('auth-error-msg');
            if (errEl) errEl.style.display = 'none';

            const isDemoAdminPass = (password === 'admin1' || password === 'admin' || password === 'mpob1998' || password === 'porim1998');
            const isPalmnexAdminUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput === 'admin1@palmnex.com.my' || cleanInput.startsWith('adminpalmnex'));
            if (isDemoAdminPass && isPalmnexAdminUser) {
                const displayUser = (cleanInput === 'admin1' || cleanInput === 'admin' || cleanInput.startsWith('admin1@'))
                    ? 'Admin'
                    : rawInput.split('@')[0];
                const adminUser = {
                    email: rawInput.includes('@') ? rawInput : `${cleanInput}@palmnex.com.my`,
                    username: displayUser,
                    company: companyInput || 'Palmnex Sdn Bhd',
                    company_code: 'palmnex',
                    access_tier: 'C',
                    storage_group: 'storage_all',
                    id: 'usr_demo_admin1',
                    role: 'admin'
                };
                localStorage.setItem('palmnex_user_session', JSON.stringify(adminUser));
                localStorage.setItem('reada_logged_in', 'true');
                if (typeof window.syncPalmnexSsoState === 'function') window.syncPalmnexSsoState(adminUser);
                if (typeof window.applyModuleAccessControl === 'function') window.applyModuleAccessControl(adminUser);
                renderFallbackSessionBanner();
                window.closeAuthModal();
                window.updateTopNavUser(adminUser);
                return;
            }

            let emailToAuth = rawInput.includes('@') ? rawInput : `${rawInput}@palmnex.com.my`;
            const client = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
            if (client && client.auth) {
                try {
                    const { data, error } = await client.auth.signInWithPassword({ email: emailToAuth, password });
                    if (error) throw error;
                    const plainUser = rawInput.includes('@') ? rawInput.split('@')[0] : rawInput;
                    let accessTier = 'A';
                    let storageGroup = `storage_${plainUser.toLowerCase()}`;
                    let companyName = companyInput;
                    let companyCode = plainUser.toLowerCase().replace(/^admin([a-z0-9_-]+?)(\d*)$/, '$1') || 'client';
                    try {
                        const { data: prof } = await client
                            .from('profiles')
                            .select('username, company_code, company_name, estate_company, access_tier, storage_group')
                            .eq('id', data.user.id)
                            .maybeSingle();
                        if (prof) {
                            accessTier = String(prof.access_tier || 'A').toUpperCase();
                            companyCode = prof.company_code || companyCode;
                            storageGroup = prof.storage_group || storageGroup;
                            companyName = (companyInput && companyInput !== 'Palmnex Sdn Bhd') ? companyInput : (prof.estate_company || prof.company_name || companyName);
                        }
                    } catch (e) {}
                    const userObj = Object.assign({}, data.user, {
                        username: plainUser,
                        company: companyName,
                        company_code: companyCode,
                        access_tier: accessTier,
                        storage_group: storageGroup
                    });
                    localStorage.setItem('palmnex_user_session', JSON.stringify(userObj));
                    if (accessTier !== 'A') localStorage.setItem('reada_logged_in', 'true');
                    if (typeof window.syncPalmnexSsoState === 'function') window.syncPalmnexSsoState(userObj);
                    if (typeof window.applyModuleAccessControl === 'function') window.applyModuleAccessControl(userObj);
                    renderFallbackSessionBanner();
                    window.closeAuthModal();
                    window.updateTopNavUser(userObj);
                    return;
                } catch (err) {
                    if (errEl) {
                        errEl.textContent = err.message || 'Invalid PalmnexReaDS username or password.';
                        errEl.style.display = 'block';
                    }
                    return;
                }
            }

            if (errEl) {
                errEl.textContent = 'Invalid PalmnexReaDS username or password.';
                errEl.style.display = 'block';
            }
        };
    }

    function bindSharedTopSearch() {
        // Skip if home_dashboard.js is active on this page (it binds its own map-zoom search)
        if (document.getElementById('sp-home-map')) return;

        const searchInput = document.getElementById('sp-global-search-input');
        const resultsBox = document.getElementById('sp-search-results-dropdown');
        if (!searchInput || !resultsBox) return;

        searchInput.addEventListener('input', () => {
            const q = searchInput.value.trim().toLowerCase();
            if (!q) {
                resultsBox.style.display = 'none';
                return;
            }
            const catalog = getCatalog();
            const matches = catalog.filter(e =>
                e.name.toLowerCase().includes(q) ||
                (e.state && e.state.toLowerCase().includes(q)) ||
                e.key.toLowerCase().includes(q)
            );
            if (matches.length === 0) {
                resultsBox.innerHTML = `<div class="sp-search-result-item" style="color:#94a3b8;">No matching estate found</div>`;
            } else {
                resultsBox.innerHTML = matches.map(e => `
                    <div class="sp-search-result-item" onclick="window.location.href='index.html?estate=${encodeURIComponent(e.key)}'">
                        <span><b>${e.name}</b> <span style="color:#94a3b8;font-size:11px;">(${e.state})</span></span>
                        <span style="color:#34d399;font-weight:700;">${e.blocksCount} blk</span>
                    </div>
                `).join('');
            }
            resultsBox.style.display = 'block';
        });

        document.addEventListener('keydown', (ev) => {
            if (ev.ctrlKey && ev.shiftKey && (ev.key === 'F' || ev.key === 'f')) {
                ev.preventDefault();
                searchInput.focus();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        ensureTopPanelModals();
        renderTopNotificationDropdownShared();
        bindSharedTopSearch();

        // Sync user profile pill from localStorage session, apply RBAC module visibility, and decorate www.palmnex.com.my SSO links
        try {
            const saved = localStorage.getItem('palmnex_user_session');
            if (saved) {
                const parsed = JSON.parse(saved);
                window.updateTopNavUser(parsed);
                if (typeof window.syncPalmnexSsoState === 'function') window.syncPalmnexSsoState(parsed);
                if (typeof window.applyModuleAccessControl === 'function') window.applyModuleAccessControl(parsed);
            } else if (window.PALMNEX_REQUIRE_LOGIN !== false) {
                window.updateTopNavUser(null);
                if (typeof window.openAuthModal === 'function') window.openAuthModal('signin');
            } else {
                const defUser = { username: 'Admin', company: 'Palmnex Sdn Bhd', company_code: 'palmnex', access_tier: 'C', storage_group: 'storage_all', email: 'admin1@palmnex.com.my' };
                window.updateTopNavUser(defUser);
                if (typeof window.syncPalmnexSsoState === 'function') window.syncPalmnexSsoState(defUser);
                if (typeof window.applyModuleAccessControl === 'function') window.applyModuleAccessControl(defUser);
            }
        } catch (e) {
            window.updateTopNavUser(null);
        }

        // Global outside click listener for top bar dropdowns
        document.addEventListener('click', (ev) => {
            const kpsmDropdown = document.getElementById('sp-top-kpsm-dropdown');
            if (kpsmDropdown && !kpsmDropdown.contains(ev.target)) {
                kpsmDropdown.classList.remove('open');
            }
            const notifWrap = document.getElementById('sp-notif-dropdown-wrap');
            if (notifWrap && !notifWrap.contains(ev.target)) {
                const dd = document.getElementById('sp-top-notif-dropdown');
                if (dd) dd.classList.remove('open');
            }
            const searchBox = document.querySelector('.sp-search-box');
            const resultsBox = document.getElementById('sp-search-results-dropdown');
            if (searchBox && resultsBox && !searchBox.contains(ev.target)) {
                resultsBox.style.display = 'none';
            }
        });
    });
})();
