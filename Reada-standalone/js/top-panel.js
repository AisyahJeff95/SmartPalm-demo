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

    let _accountDropdownHoverTimer = null;

    window.closeAccountDropdown = function () {
        const dd = document.getElementById('sp-top-account-dropdown');
        const wrap = document.getElementById('sp-account-dropdown-wrap');
        if (dd) dd.classList.remove('open');
        if (wrap) wrap.classList.remove('open');
    };

    window.refreshAccountDropdownUI = function (userOverride) {
        let user = userOverride;
        if (!user) {
            try {
                const raw = localStorage.getItem('palmnex_user_session');
                if (raw) user = JSON.parse(raw);
            } catch (e) {}
        }

        const rawUsername = (user && (user.username || user.user_metadata?.username || user.user_metadata?.full_name || user.email?.split('@')[0])) || 'Admin';
        const displayName = (rawUsername.toLowerCase() === 'admin1' || rawUsername === 'Lead Agronomist (Admin)') ? 'Admin' : rawUsername;
        const companyName = (user && (user.company || user.estate_company || user.user_metadata?.estate_company || user.user_metadata?.company_name)) || 'Palmnex Sdn Bhd';
        const email = (user && user.email) || `${rawUsername.toLowerCase()}@palmnex.com.my`;
        const tier = String((user && user.access_tier) || 'C').toUpperCase();
        const roleLabel = tier === 'C'
            ? 'Access Tier C • Master Admin'
            : (tier === 'B' ? 'Access Tier B • Client View' : 'Access Tier A • Client View');
        const initials = displayName.slice(0, 2).toUpperCase();

        const setElText = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.textContent = txt;
        };
        setElText('sp-acc-dd-avatar-initials', initials);
        setElText('sp-acc-dd-name', displayName);
        setElText('sp-acc-dd-company', companyName);
        setElText('sp-acc-dd-email', email);
        setElText('sp-acc-dd-tier-badge', roleLabel);

        // Sync custom uploaded profile picture into top bar avatar and dropdown avatar
        try {
            const avatarKey = `palmnex_profile_avatar_${rawUsername.toLowerCase()}`;
            const savedAvatar = localStorage.getItem(avatarKey) || localStorage.getItem('palmnex_profile_avatar_default');
            const ddAvatar = document.querySelector('.sp-acc-dd-avatar');
            const topAvatar = document.querySelector('.sp-profile-btn .sp-avatar-circle');

            if (savedAvatar) {
                if (ddAvatar) {
                    ddAvatar.style.backgroundImage = `url(${savedAvatar})`;
                    ddAvatar.style.backgroundSize = 'cover';
                    ddAvatar.style.backgroundPosition = 'center';
                    const initEl = document.getElementById('sp-acc-dd-avatar-initials');
                    if (initEl) initEl.style.display = 'none';
                }
                if (topAvatar) {
                    topAvatar.style.backgroundImage = `url(${savedAvatar})`;
                    topAvatar.style.backgroundSize = 'cover';
                    topAvatar.style.backgroundPosition = 'center';
                    const spanInit = topAvatar.querySelector('span:not(.sp-avatar-status)');
                    if (spanInit) spanInit.style.display = 'none';
                }
            } else {
                if (ddAvatar) {
                    ddAvatar.style.backgroundImage = '';
                    const initEl = document.getElementById('sp-acc-dd-avatar-initials');
                    if (initEl) initEl.style.display = '';
                }
                if (topAvatar) {
                    topAvatar.style.backgroundImage = '';
                    const spanInit = topAvatar.querySelector('span:not(.sp-avatar-status)');
                    if (spanInit) spanInit.style.display = '';
                }
            }
        } catch (e) {}
    };

    function ensureAccountHoverDropdown() {
        if (!document.getElementById('sp-account-hover-dropdown-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'sp-account-hover-dropdown-styles';
            styleEl.textContent = `
                .sp-account-dropdown-wrap {
                    position: relative;
                    display: inline-flex;
                    align-items: center;
                }
                .sp-account-dropdown-wrap .sp-profile-caret {
                    font-size: 9px;
                    opacity: 0.7;
                    margin-left: 2px;
                    transition: transform 0.2s ease;
                }
                .sp-account-dropdown-wrap.open .sp-profile-caret,
                .sp-account-dropdown-wrap:hover .sp-profile-caret {
                    transform: rotate(180deg);
                    opacity: 1;
                }
                .sp-top-account-dropdown {
                    display: none;
                    position: absolute;
                    top: calc(100% + 10px);
                    right: 0;
                    width: 295px;
                    background: rgba(16, 20, 27, 0.98);
                    backdrop-filter: blur(22px);
                    -webkit-backdrop-filter: blur(22px);
                    border: 1px solid rgba(255, 255, 255, 0.16);
                    border-radius: 14px;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.78);
                    z-index: 10000003;
                    flex-direction: column;
                    overflow: visible;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    user-select: none;
                }
                /* Invisible hover bridge so moving mouse from pill to dropdown never loses hover */
                .sp-top-account-dropdown::before {
                    content: '';
                    position: absolute;
                    top: -14px;
                    left: 0;
                    right: 0;
                    height: 14px;
                    background: transparent;
                }
                .sp-top-account-dropdown.open {
                    display: flex;
                }
                .sp-acc-dd-header {
                    padding: 14px 16px 12px 16px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    background: rgba(255, 255, 255, 0.025);
                    border-radius: 14px 14px 0 0;
                    display: flex;
                    align-items: flex-start;
                    gap: 12px;
                }
                .sp-acc-dd-avatar {
                    width: 38px;
                    height: 38px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                    border: 1px solid rgba(255, 255, 255, 0.28);
                    color: #ffffff;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 13px;
                    font-weight: 700;
                    flex-shrink: 0;
                    position: relative;
                    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.28);
                }
                .sp-acc-dd-avatar-dot {
                    position: absolute;
                    bottom: 0;
                    right: 0;
                    width: 9px;
                    height: 9px;
                    border-radius: 50%;
                    background: #34d399;
                    border: 1.5px solid #10141b;
                }
                .sp-acc-dd-user-info {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .sp-acc-dd-name {
                    font-size: 13.5px;
                    font-weight: 700;
                    color: #ffffff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .sp-acc-dd-company {
                    font-size: 11.5px;
                    font-weight: 600;
                    color: #34d399;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .sp-acc-dd-email {
                    font-size: 11px;
                    color: #94a3b8;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .sp-acc-dd-tier-badge {
                    display: inline-flex;
                    align-items: center;
                    align-self: flex-start;
                    margin-top: 5px;
                    padding: 2px 8px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.14);
                    color: #e2e8f0;
                    font-size: 10px;
                    font-weight: 600;
                    letter-spacing: 0.2px;
                }
                .sp-acc-dd-menu {
                    padding: 6px;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }
                .sp-acc-dd-item {
                    display: flex;
                    align-items: center;
                    gap: 11px;
                    padding: 9px 10px;
                    border-radius: 9px;
                    color: #e2e8f0;
                    text-decoration: none;
                    background: transparent;
                    border: none;
                    width: 100%;
                    text-align: left;
                    font-family: inherit;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    box-sizing: border-box;
                }
                .sp-acc-dd-item:hover {
                    background: rgba(255, 255, 255, 0.08);
                    color: #ffffff;
                }
                .sp-acc-dd-item-icon {
                    width: 28px;
                    height: 28px;
                    border-radius: 7px;
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #cbd5e1;
                    flex-shrink: 0;
                    transition: all 0.15s ease;
                }
                .sp-acc-dd-item:hover .sp-acc-dd-item-icon {
                    background: rgba(16, 185, 129, 0.16);
                    border-color: rgba(16, 185, 129, 0.38);
                    color: #34d399;
                }
                .sp-acc-dd-item-text {
                    flex: 1;
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                }
                .sp-acc-dd-item-title {
                    font-size: 12.5px;
                    font-weight: 600;
                    color: #f8fafc;
                    line-height: 1.25;
                }
                .sp-acc-dd-item-sub {
                    font-size: 10.5px;
                    color: #94a3b8;
                    line-height: 1.25;
                }
                .sp-acc-dd-divider {
                    height: 1px;
                    background: rgba(255, 255, 255, 0.08);
                    margin: 4px 6px;
                }
                .sp-acc-dd-footer {
                    padding: 6px 8px 8px 8px;
                    border-top: 1px solid rgba(255, 255, 255, 0.08);
                    background: rgba(255, 255, 255, 0.015);
                    border-radius: 0 0 14px 14px;
                }
                .sp-acc-dd-logout-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    width: 100%;
                    padding: 8px 12px;
                    border-radius: 9px;
                    background: rgba(239, 68, 68, 0.14);
                    border: 1px solid rgba(239, 68, 68, 0.36);
                    color: #fca5a5;
                    font-size: 12.5px;
                    font-weight: 600;
                    font-family: inherit;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }
                .sp-acc-dd-logout-btn:hover {
                    background: rgba(239, 68, 68, 0.24);
                    border-color: rgba(239, 68, 68, 0.55);
                    color: #ffffff;
                }
            `;
            document.head.appendChild(styleEl);
        }

        const rightControls = document.querySelector('.sp-top-right-controls');
        if (rightControls) {
            // Remove standalone Settings and History buttons from top bar (now inside Account dropdown)
            rightControls.querySelectorAll('button[onclick*="sp-settings-modal"], #sp-top-history-btn, a[href*="filter=runs"]').forEach(el => {
                el.style.display = 'none';
            });
            // Ensure User Manual button opens the Walkthrough Tour prompt modal
            rightControls.querySelectorAll('button[onclick*="manual-modal"]').forEach(btn => {
                btn.onclick = function (ev) {
                    if (ev) ev.preventDefault();
                    if (typeof window.openWalkthroughPromptModal === 'function') {
                        window.openWalkthroughPromptModal();
                    } else {
                        const m = document.getElementById('manual-modal');
                        if (m) m.style.display = 'flex';
                    }
                };
            });
        }

        const profileBtn = document.querySelector('.sp-profile-btn');
        if (!profileBtn || document.getElementById('sp-top-account-dropdown')) return;

        // Remove native title tooltip so it doesn't overlap the hover dropdown
        profileBtn.removeAttribute('title');

        if (!profileBtn.querySelector('.sp-profile-caret')) {
            const caret = document.createElement('span');
            caret.className = 'sp-profile-caret';
            caret.textContent = '▾';
            profileBtn.appendChild(caret);
        }

        const wrap = document.createElement('div');
        wrap.className = 'sp-account-dropdown-wrap';
        wrap.id = 'sp-account-dropdown-wrap';
        profileBtn.parentNode.insertBefore(wrap, profileBtn);
        wrap.appendChild(profileBtn);

        const dd = document.createElement('div');
        dd.id = 'sp-top-account-dropdown';
        dd.className = 'sp-top-account-dropdown';
        dd.innerHTML = `
            <div class="sp-acc-dd-header">
                <div class="sp-acc-dd-avatar">
                    <span id="sp-acc-dd-avatar-initials">AD</span>
                    <span class="sp-acc-dd-avatar-dot"></span>
                </div>
                <div class="sp-acc-dd-user-info">
                    <div class="sp-acc-dd-name" id="sp-acc-dd-name">Admin</div>
                    <div class="sp-acc-dd-company" id="sp-acc-dd-company">Palmnex Sdn Bhd</div>
                    <div class="sp-acc-dd-email" id="sp-acc-dd-email">admin1@palmnex.com.my</div>
                    <div class="sp-acc-dd-tier-badge" id="sp-acc-dd-tier-badge">Access Tier C • Master Admin</div>
                </div>
            </div>
            <div class="sp-acc-dd-menu">
                <a href="profile.html" class="sp-acc-dd-item" onclick="window.closeAccountDropdown()">
                    <span class="sp-acc-dd-item-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </span>
                    <span class="sp-acc-dd-item-text">
                        <span class="sp-acc-dd-item-title">Profile</span>
                        <span class="sp-acc-dd-item-sub">Account details, role &amp; security</span>
                    </span>
                </a>
                <a href="notifications.html?filter=runs" class="sp-acc-dd-item" onclick="window.closeAccountDropdown()">
                    <span class="sp-acc-dd-item-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </span>
                    <span class="sp-acc-dd-item-text">
                        <span class="sp-acc-dd-item-title">History</span>
                        <span class="sp-acc-dd-item-sub">Prediction &amp; run history</span>
                    </span>
                </a>
                <button type="button" class="sp-acc-dd-item" onclick="window.closeAccountDropdown(); const sm=document.getElementById('sp-settings-modal'); if(sm) sm.style.display='flex';">
                    <span class="sp-acc-dd-item-icon">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    </span>
                    <span class="sp-acc-dd-item-text">
                        <span class="sp-acc-dd-item-title">Settings</span>
                        <span class="sp-acc-dd-item-sub">System &amp; quota settings</span>
                    </span>
                </button>
            </div>
            <div class="sp-acc-dd-footer">
                <button type="button" class="sp-acc-dd-logout-btn" onclick="window.closeAccountDropdown(); if(typeof handleSignOut==='function') handleSignOut();">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    <span>Log Out</span>
                </button>
            </div>
        `;
        wrap.appendChild(dd);

        const openDropdown = () => {
            if (_accountDropdownHoverTimer) {
                clearTimeout(_accountDropdownHoverTimer);
                _accountDropdownHoverTimer = null;
            }
            window.refreshAccountDropdownUI();
            dd.classList.add('open');
            wrap.classList.add('open');
        };

        const scheduleCloseDropdown = () => {
            if (_accountDropdownHoverTimer) clearTimeout(_accountDropdownHoverTimer);
            _accountDropdownHoverTimer = setTimeout(() => {
                dd.classList.remove('open');
                wrap.classList.remove('open');
            }, 160);
        };

        wrap.addEventListener('mouseenter', openDropdown);
        wrap.addEventListener('mouseleave', scheduleCloseDropdown);

        profileBtn.onclick = function (ev) {
            if (ev) ev.stopPropagation();
            if (dd.classList.contains('open')) {
                window.closeAccountDropdown();
            } else {
                openDropdown();
            }
        };

        window.refreshAccountDropdownUI();
    }

    // Inject missing modals (#sp-settings-modal, #manual-modal, #auth-modal) and Account Hover Dropdown so buttons work on every page
    function ensureTopPanelModals() {
        ensureAccountHoverDropdown();

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

        const walkthroughModalMarkup = `
            <div class="modal-content" style="max-width: 440px; width: 92%; background: #141922; color: #f8fafc; border: 1px solid rgba(255,255,255,0.16); border-radius: 18px; padding: 28px 26px 22px 26px; position: relative; box-shadow: 0 28px 68px rgba(0,0,0,0.82); font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; text-align: center;">
                <button type="button" style="position: absolute; top: 14px; right: 16px; background: none; border: none; font-size: 19px; color: #94a3b8; cursor: pointer;" onclick="window.handleWalkthroughPromptChoice('no')" title="Close">✕</button>
                <div style="width: 52px; height: 52px; border-radius: 14px; background: rgba(16, 185, 129, 0.14); border: 1px solid rgba(16, 185, 129, 0.35); color: #34d399; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px auto; box-shadow: 0 8px 20px rgba(16, 185, 129, 0.18);">
                    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
                    </svg>
                </div>
                <h3 style="margin: 0 0 10px 0; font-family: 'Outfit', sans-serif; font-size: 20px; font-weight: 700; color: #ffffff; line-height: 1.35;">
                    Would you like a walkthrough Tour of MPOBPALMNEX System?
                </h3>
                <p style="margin: 0 0 22px 0; font-size: 13px; color: #94a3b8; line-height: 1.55;">
                    Start an interactive step-by-step spotlight tour across the Home Command Center, Comprehensive &amp; Standard Fertilization Dashboards, and any page you click.
                </p>
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 18px;">
                    <button type="button" onclick="window.handleWalkthroughPromptChoice('no')" style="flex: 1; height: 42px; border-radius: 10px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.16); color: #e2e8f0; font-size: 13.5px; font-weight: 600; font-family: inherit; cursor: pointer; transition: all 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.06)'">
                        No
                    </button>
                    <button type="button" onclick="window.handleWalkthroughPromptChoice('yes')" style="flex: 1; height: 42px; border-radius: 10px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); border: 1px solid #34d399; color: #ffffff; font-size: 13.5px; font-weight: 700; font-family: inherit; cursor: pointer; box-shadow: 0 6px 16px rgba(16, 185, 129, 0.32); transition: all 0.15s ease;" onmouseover="this.style.filter='brightness(1.08)'" onmouseout="this.style.filter='none'">
                        Yes
                    </button>
                </div>
                <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 12px; display: flex; align-items: center; justify-content: center;">
                    <label style="display: inline-flex; align-items: center; gap: 8px; font-size: 12.5px; color: #94a3b8; cursor: pointer; user-select: none;">
                        <input type="checkbox" id="sp-walkthrough-dont-ask-chk" onchange="try { if (this.checked) localStorage.setItem('palmnex_walkthrough_dont_ask_v1', 'true'); else localStorage.removeItem('palmnex_walkthrough_dont_ask_v1'); } catch(e){}" style="width: 15px; height: 15px; accent-color: #10b981; cursor: pointer;" />
                        <span>Don't ask me again</span>
                    </label>
                </div>
            </div>
        `;

        let manualDiv = document.getElementById('manual-modal');
        if (!manualDiv) {
            manualDiv = document.createElement('div');
            manualDiv.id = 'manual-modal';
            manualDiv.className = 'modal-overlay';
            manualDiv.setAttribute('data-walkthrough-v2', 'true');
            manualDiv.style.cssText = 'display: none; align-items: center; justify-content: center; z-index: 9999999; position: fixed; inset: 0; background: rgba(0,0,0,0.68); backdrop-filter: blur(6px);';
            manualDiv.innerHTML = walkthroughModalMarkup;
            document.body.appendChild(manualDiv);
        } else if (!manualDiv.hasAttribute('data-walkthrough-v2')) {
            const wasOpen = manualDiv.style.display === 'flex';
            manualDiv.setAttribute('data-walkthrough-v2', 'true');
            manualDiv.style.cssText = `display: ${wasOpen ? 'flex' : 'none'}; align-items: center; justify-content: center; z-index: 9999999; position: fixed; inset: 0; background: rgba(0,0,0,0.68); backdrop-filter: blur(6px);`;
            manualDiv.innerHTML = walkthroughModalMarkup;
        }

        const dontAskChk = document.getElementById('sp-walkthrough-dont-ask-chk');
        if (dontAskChk) {
            dontAskChk.checked = (localStorage.getItem('palmnex_walkthrough_dont_ask_v1') === 'true');
        }

        // Inject Driver.js styles & multi-page tutorial overrides
        if (!document.getElementById('sp-driverjs-custom-styles')) {
            const drvStyle = document.createElement('style');
            drvStyle.id = 'sp-driverjs-custom-styles';
            drvStyle.textContent = `
                /* Allow clicking Top Navigation & Left Sidebar at any point during the tutorial to jump between pages */
                body.sp-driver-tour-active .cms-top-panel,
                body.sp-driver-tour-active .cms-sidebar {
                    z-index: 10000005 !important;
                    pointer-events: auto !important;
                }
                .driver-popover {
                    background: #ffffff !important;
                    color: #0f172a !important;
                    border-radius: 12px !important;
                    padding: 18px 20px !important;
                    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(15, 23, 42, 0.1) !important;
                    max-width: 360px !important;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif !important;
                    z-index: 10000008 !important;
                }
                .driver-popover-title {
                    font-family: 'Outfit', 'Inter', sans-serif !important;
                    font-size: 17px !important;
                    font-weight: 800 !important;
                    color: #0f172a !important;
                    margin-bottom: 6px !important;
                    line-height: 1.3 !important;
                }
                .driver-popover-description {
                    font-size: 13.5px !important;
                    color: #334155 !important;
                    line-height: 1.55 !important;
                    margin-bottom: 14px !important;
                }
                .driver-popover-progress-text {
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    color: #64748b !important;
                }
                .driver-popover-footer button {
                    border-radius: 7px !important;
                    padding: 6px 13px !important;
                    font-size: 12.5px !important;
                    font-weight: 700 !important;
                    font-family: 'Inter', sans-serif !important;
                    text-shadow: none !important;
                    cursor: pointer !important;
                    transition: all 0.15s ease !important;
                }
                .driver-popover-next-btn {
                    background: #0f172a !important;
                    color: #ffffff !important;
                    border: 1px solid #0f172a !important;
                }
                .driver-popover-next-btn:hover {
                    background: #1e293b !important;
                }
                .driver-popover-prev-btn {
                    background: #f1f5f9 !important;
                    color: #334155 !important;
                    border: 1px solid #cbd5e1 !important;
                }
                .driver-popover-prev-btn:hover {
                    background: #e2e8f0 !important;
                }
                #sp-end-tutorial-floating-wrap {
                    display: none;
                    position: fixed;
                    bottom: 24px;
                    right: 24px;
                    z-index: 10000010;
                    align-items: center;
                    gap: 10px;
                    background: rgba(15, 20, 28, 0.96);
                    backdrop-filter: blur(14px);
                    -webkit-backdrop-filter: blur(14px);
                    border: 1px solid rgba(255, 255, 255, 0.18);
                    border-radius: 999px;
                    padding: 7px 9px 7px 14px;
                    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.78);
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
                    user-select: none;
                }
                #sp-end-tutorial-floating-wrap.active {
                    display: inline-flex;
                }
                .sp-tour-status-label {
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    font-size: 12px;
                    font-weight: 600;
                    color: #cbd5e1;
                    cursor: pointer;
                }
                .sp-tour-status-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: #10b981;
                    box-shadow: 0 0 8px #10b981;
                }
                .sp-end-tutorial-btn {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 8px 16px;
                    border-radius: 999px;
                    background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
                    border: 1px solid #f87171;
                    color: #ffffff;
                    font-size: 12.5px;
                    font-weight: 700;
                    font-family: inherit;
                    cursor: pointer;
                    box-shadow: 0 4px 14px rgba(239, 68, 68, 0.4);
                    transition: all 0.15s ease;
                }
                .sp-end-tutorial-btn:hover {
                    filter: brightness(1.1);
                    transform: translateY(-1px);
                }
            `;
            document.head.appendChild(drvStyle);
        }

        if (!document.getElementById('sp-end-tutorial-floating-wrap')) {
            const floatWrap = document.createElement('div');
            floatWrap.id = 'sp-end-tutorial-floating-wrap';
            floatWrap.innerHTML = `
                <span class="sp-tour-status-label" onclick="window.startPalmnexDriverTourForCurrentPage()" title="Click to replay walkthrough steps on this page">
                    <span class="sp-tour-status-dot"></span>
                    <span>Walkthrough Active (Click any page tab)</span>
                </span>
                <button type="button" class="sp-end-tutorial-btn" onclick="window.endPalmnexTutorial()">
                    <span>✕</span>
                    <span>End Tutorial</span>
                </button>
            `;
            document.body.appendChild(floatWrap);
        }

        function ensureDriverJsLoaded(callback) {
            if (window.driver && window.driver.js && typeof window.driver.js.driver === 'function') {
                callback(window.driver.js.driver);
                return;
            }
            if (!document.getElementById('sp-driverjs-css')) {
                const link = document.createElement('link');
                link.id = 'sp-driverjs-css';
                link.rel = 'stylesheet';
                link.href = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.css';
                document.head.appendChild(link);
            }
            const existingScript = document.getElementById('sp-driverjs-script');
            if (existingScript) {
                existingScript.addEventListener('load', () => {
                    if (window.driver && window.driver.js && typeof window.driver.js.driver === 'function') {
                        callback(window.driver.js.driver);
                    }
                });
                return;
            }
            const s = document.createElement('script');
            s.id = 'sp-driverjs-script';
            s.src = 'https://cdn.jsdelivr.net/npm/driver.js@1.3.1/dist/driver.js.iife.js';
            s.onload = () => {
                if (window.driver && window.driver.js && typeof window.driver.js.driver === 'function') {
                    callback(window.driver.js.driver);
                }
            };
            document.head.appendChild(s);
        }

        function buildStepsForCurrentPage() {
            const pathLower = (window.location.pathname || '').toLowerCase();
            const isComp = pathLower.includes('comprehensive');
            const isStd = pathLower.includes('standard');
            const isNotif = pathLower.includes('notifications');
            const isKpsm = pathLower.includes('kpsm');
            const isProfile = pathLower.includes('profile');

            let candidateSteps = [];

            if (isComp) {
                candidateSteps = [
                    {
                        element: '#card-map-file-selection',
                        popover: {
                            title: '1. Map File Selection',
                            description: 'Select an existing estate boundary from the dropdown or upload custom .shp and .dbf boundary files to render blocks on the interactive map.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '#card-satellite-data',
                        popover: {
                            title: '2. Satellite Data & EDS Soil Type',
                            description: 'Choose Real-time or Previous Sentinel-2 imagery dates, inspect the detected soil type, and enter Inland or Alluvial/Coastal soil parameters.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '#btn-run-prediction',
                        popover: {
                            title: '3. Run AI Foliar Nutrient Prediction',
                            description: 'Click Run Prediction to execute the Random Forest AI model on Sentinel-1 & Sentinel-2 bands and generate block-level foliar N, P, K, Mg, Ca, and B diagnostics.',
                            side: 'right',
                            align: 'center'
                        }
                    },
                    {
                        element: '.leaflet-nutrient-selector',
                        popover: {
                            title: '4. Nutrient Heatmap Layer Selector',
                            description: 'Toggle between N%, P%, K%, Mg%, Ca%, and B (ppm) detection rasters on the map and inspect the critical agronomy color thresholds.',
                            side: 'left',
                            align: 'start'
                        }
                    },
                    {
                        element: '#fert-list-input',
                        popover: {
                            title: '5. Fertilizer Formulation & Ratio',
                            description: 'Enter custom N:P:K:Mg:B ratios or choose a standard MPOB Fertilizer formulation (F1, F1 Xtra K, F2 Super K, F3, F4, etc.) and log current dosage.',
                            side: 'right',
                            align: 'center'
                        }
                    },
                    {
                        element: '#report-admin-section, #client-block-grouping-section',
                        popover: {
                            title: '6. Block Selection & Agronomy Report',
                            description: 'Click block(s) on the map to group or inspect, review client remarks, and click Generate Report to produce the official MPOB Fertilization PDF Report.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '#card-drone-upload',
                        popover: {
                            title: '7. Optional Drone Overlay & Report Name',
                            description: 'Optionally upload high-resolution drone orthomosaics (.tif/.png/.jpg) and customize the Estate Name printed on the report.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '.sp-top-nav-pills',
                        popover: {
                            title: '8. Switch Pages Anytime!',
                            description: 'Click Standard Fert, Home, or KPSM System in the top bar to continue the walkthrough on that page, or click End Tutorial at the bottom right.',
                            side: 'bottom',
                            align: 'start'
                        }
                    }
                ];
            } else if (isStd) {
                candidateSteps = [
                    {
                        element: '#card-map-file-selection',
                        popover: {
                            title: '1. Estate Boundary Selection',
                            description: 'Select your target estate boundary from the dropdown or upload .shp / .dbf files to load the plantation blocks.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '#card-satellite-data',
                        popover: {
                            title: '2. Satellite Date & Soil Type',
                            description: 'Select Real-time or historical Sentinel-2 dates and verify the MPOB Reconnaissance Soil Type for the estate.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '#btn-run-prediction',
                        popover: {
                            title: '3. Run Standard Nutrient Prediction',
                            description: 'Click Run Prediction to evaluate block-level foliar N, P, K, Mg, Ca, and B values across the selected estate.',
                            side: 'right',
                            align: 'center'
                        }
                    },
                    {
                        element: '.leaflet-nutrient-selector',
                        popover: {
                            title: '4. Interactive Nutrient Layers',
                            description: 'Switch between N, P, K, Mg, Ca, and B heatmap layers on the satellite map and click any block polygon to view its values.',
                            side: 'left',
                            align: 'start'
                        }
                    },
                    {
                        element: '#fert-list-input',
                        popover: {
                            title: '5. Standard Fertilizer Recommendation',
                            description: 'Specify custom N:P:K:Mg ratios or select an MPOB compound fertilizer formulation to compute corrective fertilizer rates.',
                            side: 'right',
                            align: 'center'
                        }
                    },
                    {
                        element: '.ui-generate-report-btn',
                        popover: {
                            title: '6. Generate Standard Fertilization Report',
                            description: 'Click a block on the map and click Generate Report to export the Standard Fertilization Recommendation PDF.',
                            side: 'right',
                            align: 'center'
                        }
                    },
                    {
                        element: '.sp-top-nav-pills',
                        popover: {
                            title: '7. Explore Other Dashboards',
                            description: 'Click Comprehensive Fert, Home, or any module tab above to continue the walkthrough there, or click End Tutorial at the bottom right.',
                            side: 'bottom',
                            align: 'start'
                        }
                    }
                ];
            } else if (isNotif) {
                candidateSteps = [
                    {
                        element: '.cms-main-content',
                        popover: {
                            title: '1. Notifications & Prediction Run History',
                            description: 'Review all saved satellite nutrient prediction runs, upcoming fertilizer application reminders, and system alerts in one place.',
                            side: 'top',
                            align: 'center'
                        }
                    },
                    {
                        element: '.sp-top-nav-pills',
                        popover: {
                            title: '2. Continue Walkthrough on Any Page',
                            description: 'Click Home, Comprehensive Fert, or Standard Fert in the top bar to tour another module, or click End Tutorial at the bottom right.',
                            side: 'bottom',
                            align: 'start'
                        }
                    }
                ];
            } else if (isKpsm || isProfile) {
                candidateSteps = [
                    {
                        element: '.cms-main-content, body',
                        popover: {
                            title: '1. Module Overview',
                            description: 'Use this workspace to manage smallholder cooperatives, estate boundaries, and account settings.',
                            side: 'bottom',
                            align: 'center'
                        }
                    },
                    {
                        element: '.sp-top-nav-pills',
                        popover: {
                            title: '2. Navigate Across Modules',
                            description: 'Click Home, Comprehensive Fert, or Standard Fert in the top bar to continue the walkthrough, or click End Tutorial at the bottom right.',
                            side: 'bottom',
                            align: 'start'
                        }
                    }
                ];
            } else {
                // Default: Home Page (index.html)
                candidateSteps = [
                    {
                        element: '.sp-top-nav-pills',
                        popover: {
                            title: '1. Top Navigation & Modules',
                            description: 'Switch seamlessly between the Home Command Center, Comprehensive Fertilization, Standard Fertilization, PalmNexReaDS, and KPSM System. You can click any module tab at any time to continue the tour on that page!',
                            side: 'bottom',
                            align: 'start'
                        }
                    },
                    {
                        element: '.sp-total-estate-card',
                        popover: {
                            title: '2. Total Estate Company & Online Status',
                            description: 'View total monitored plantation companies, active online estates, total hectares, and block counts at a glance.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '.sp-estate-directory-card',
                        popover: {
                            title: '3. Browse All Estates Directory',
                            description: 'Click any company cluster or estate card in this list to automatically zoom the interactive satellite map to its boundaries.',
                            side: 'right',
                            align: 'start'
                        }
                    },
                    {
                        element: '#sp-welcome-banner',
                        popover: {
                            title: '4. Active User & Organization Session',
                            description: 'Displays your active MPOB PalmNex account, company assignment, and access permissions.',
                            side: 'bottom',
                            align: 'start'
                        }
                    },
                    {
                        element: '#sp-company-stress-card',
                        popover: {
                            title: '5. Overall Nutrient & Canopy Stress Analytics',
                            description: 'Inspect company-wide N, P, K, Mg, Ca, and B foliar levels, overall canopy stress percentage, and interactive block stress choropleth maps.',
                            side: 'left',
                            align: 'start'
                        }
                    },
                    {
                        element: '#sp-account-dropdown-wrap',
                        popover: {
                            title: '6. Account, History & Settings Menu',
                            description: 'Hover over your account badge to open Profile, Prediction & Run History, System Settings, Organization & Estates, and Log Out.',
                            side: 'bottom',
                            align: 'end'
                        }
                    },
                    {
                        element: '.sp-top-nav-pills',
                        popover: {
                            title: '7. Click Any Dashboard to Continue!',
                            description: 'Click Comprehensive Fert or Standard Fert in the top bar now to continue the interactive walkthrough on that page, or click End Tutorial at the bottom right anytime.',
                            side: 'bottom',
                            align: 'start'
                        }
                    }
                ];
            }

            // Filter to only elements that exist and are visible on the current page
            return candidateSteps.filter(step => {
                if (!step.element) return true;
                const el = document.querySelector(step.element);
                return Boolean(el && el.offsetParent !== null);
            }).map(step => {
                const el = document.querySelector(step.element);
                return {
                    element: el || step.element,
                    popover: step.popover
                };
            });
        }

        let _activeDriverInstance = null;

        window.startPalmnexDriverTourForCurrentPage = function () {
            try {
                sessionStorage.setItem('palmnex_tour_active_v1', 'true');
            } catch (e) {}

            document.body.classList.add('sp-driver-tour-active');
            const floatWrap = document.getElementById('sp-end-tutorial-floating-wrap');
            if (floatWrap) floatWrap.classList.add('active');

            ensureDriverJsLoaded((driverFn) => {
                if (_activeDriverInstance && typeof _activeDriverInstance.destroy === 'function') {
                    try { _activeDriverInstance.destroy(); } catch (e) {}
                }
                const steps = buildStepsForCurrentPage();
                if (!steps.length) return;

                _activeDriverInstance = driverFn({
                    showProgress: true,
                    animate: true,
                    allowClose: true,
                    overlayOpacity: 0.58,
                    stagePadding: 8,
                    stageRadius: 10,
                    nextBtnText: 'Next →',
                    prevBtnText: '← Previous',
                    doneBtnText: 'Done (Page)',
                    steps: steps,
                    onDestroyed: () => {
                        // Keep the bottom-right "End Tutorial" bar visible if palmnex_tour_active_v1 is still true
                        // so the user can freely click Comprehensive / Standard / any page to continue the tour
                        const stillActive = sessionStorage.getItem('palmnex_tour_active_v1') === 'true';
                        if (!stillActive) {
                            document.body.classList.remove('sp-driver-tour-active');
                            if (floatWrap) floatWrap.classList.remove('active');
                        }
                    }
                });
                _activeDriverInstance.drive();
            });
        };

        window.endPalmnexTutorial = function () {
            try {
                sessionStorage.removeItem('palmnex_tour_active_v1');
            } catch (e) {}
            if (_activeDriverInstance && typeof _activeDriverInstance.destroy === 'function') {
                try { _activeDriverInstance.destroy(); } catch (e) {}
                _activeDriverInstance = null;
            }
            document.body.classList.remove('sp-driver-tour-active');
            const floatWrap = document.getElementById('sp-end-tutorial-floating-wrap');
            if (floatWrap) floatWrap.classList.remove('active');
        };

        window.openWalkthroughPromptModal = function () {
            const m = document.getElementById('manual-modal');
            if (!m) return;
            const chk = document.getElementById('sp-walkthrough-dont-ask-chk');
            if (chk) {
                chk.checked = (localStorage.getItem('palmnex_walkthrough_dont_ask_v1') === 'true');
            }
            m.style.display = 'flex';
        };

        window.handleWalkthroughPromptChoice = function (choice) {
            const chk = document.getElementById('sp-walkthrough-dont-ask-chk');
            try {
                if (chk && chk.checked) {
                    localStorage.setItem('palmnex_walkthrough_dont_ask_v1', 'true');
                }
                sessionStorage.setItem('palmnex_walkthrough_shown_this_session', 'true');
            } catch (e) {}

            const m = document.getElementById('manual-modal');
            if (m) m.style.display = 'none';

            if (choice === 'yes') {
                window.startPalmnexDriverTourForCurrentPage();
            }
        };

        if (typeof window.PALMNEX_REQUIRE_LOGIN === 'undefined') {
            window.PALMNEX_REQUIRE_LOGIN = true;
        }
        if (typeof ensureAuthModalEnhancements === 'function') {
            ensureAuthModalEnhancements();
        } else if (!document.getElementById('auth-modal') || !document.getElementById('auth-modal').hasAttribute('data-portal-v6')) {
            const portalInnerMarkup = `
                <aside style="width: 350px; flex-shrink: 0; height: 100vh; background: #0c1017; border-right: 1px solid rgba(255,255,255,0.08); display: flex; flex-direction: column; user-select: none;">
                    <div style="padding: 24px 28px 22px 28px; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: flex-start;">
                        <img src="MPOB-3.png" alt="MPOB PalmNex" style="width: 100%; max-width: 268px; height: auto; object-fit: contain; display: block;" />
                    </div>
                </aside>
                <div style="flex: 1; height: 100vh; position: relative; display: flex; align-items: center; justify-content: center; padding: 32px; background: linear-gradient(135deg, rgba(8, 12, 20, 0.34) 0%, rgba(10, 15, 24, 0.44) 100%), url('login-bg.jpg') center/cover no-repeat; overflow-y: auto; overflow-x: hidden;">
                    <video autoplay loop muted playsinline poster="login-bg.jpg" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; pointer-events: none;">
                        <source src="login-bg.mp4" type="video/mp4" />
                    </video>
                    <div style="position: absolute; inset: 0; background: linear-gradient(135deg, rgba(8, 12, 20, 0.30) 0%, rgba(10, 15, 24, 0.42) 100%); z-index: 1; pointer-events: none;"></div>
                    <div class="modal-content" style="max-width: 480px; width: 100%; background: rgba(18, 24, 36, 0.94); backdrop-filter: blur(8px); color: #f8fafc; border: 1px solid rgba(255,255,255,0.12); border-radius: 18px; padding: 42px 40px 32px 40px; position: relative; z-index: 2; box-shadow: 0 28px 72px rgba(0,0,0,0.68); font-family: 'Inter', sans-serif;">
                        <button type="button" id="auth-modal-close-btn" style="position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 20px; color: #94a3b8; cursor: pointer;" onclick="closeAuthModal()" title="Close">✕</button>
                        <div style="text-align: center; margin-bottom: 30px;">
                            <img src="MPOB-3.png" alt="MPOB PalmNex" style="height: 54px; width: auto; max-width: 270px; object-fit: contain; display: block; margin: 0 auto 18px auto;" />
                            <h3 style="margin: 0 0 8px 0; font-family: 'Outfit', sans-serif; font-size: 26px; font-weight: 700; color: #ffffff; letter-spacing: -0.3px;">Account Access</h3>
                            <p style="margin: 0 0 6px 0; font-size: 14px; color: #94a3b8;">Sign in to sync your PALMNEX data</p>
                            <p style="margin: 0; font-size: 13px; font-weight: 600; color: #10b981;">SmartPalm: Precision Fertilization &amp; Monitoring System · MPOB</p>
                        </div>
                        <div id="auth-error-msg" style="display: none; background: rgba(239,68,68,0.14); color: #fca5a5; border: 1px solid rgba(239,68,68,0.45); padding: 12px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 18px;"></div>
                        <div id="auth-success-msg" style="display: none; background: rgba(16,185,129,0.14); color: #6ee7b7; border: 1px solid rgba(16,185,129,0.45); padding: 12px 14px; border-radius: 10px; font-size: 13px; margin-bottom: 18px;"></div>
                        <form id="auth-form-signin" onsubmit="handleEmailSignIn(event)">
                            <div style="margin-bottom: 20px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                    <label for="signin-email" style="font-size: 13.5px; font-weight: 600; color: #e2e8f0;">Username or Email</label>
                                    <span style="font-size: 12px; color: #64748b; font-weight: 500;">Supabase / MPOB</span>
                                </div>
                                <div style="position: relative; display: flex; align-items: center; width: 100%;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 14px; color: #64748b; pointer-events: none;">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                                        <circle cx="12" cy="7" r="4"></circle>
                                    </svg>
                                    <input type="text" id="signin-email" required placeholder="Enter your username or email" value="" class="sp-sched-input" style="height: 48px; font-size: 14.5px; width: 100%; padding-left: 42px; padding-right: 14px; background: #0c1017; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #f8fafc;" />
                                </div>
                            </div>
                            <div style="margin-bottom: 20px;">
                                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                                    <label for="signin-password" style="font-size: 13.5px; font-weight: 600; color: #e2e8f0;">Password</label>
                                </div>
                                <div style="position: relative; display: flex; align-items: center; width: 100%;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="position: absolute; left: 14px; color: #64748b; pointer-events: none;">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                                    </svg>
                                    <input type="password" id="signin-password" required placeholder="••••••••" value="" class="sp-sched-input" style="height: 48px; font-size: 14.5px; width: 100%; padding-left: 42px; padding-right: 44px; background: #0c1017; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; color: #f8fafc;" />
                                    <button type="button" id="btn-toggle-signin-password" onclick="toggleAuthPasswordVisibility('signin-password', 'icon-eye-signin-password')" title="Show / Hide Password" style="position: absolute; right: 12px; background: none; border: none; color: #94a3b8; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center;">
                                        <svg id="icon-eye-signin-password" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#94a3b8;">
                                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                            <circle cx="12" cy="12" r="3"></circle>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; font-size: 13.5px; color: #94a3b8;">
                                <label style="display: inline-flex; align-items: center; gap: 9px; cursor: pointer; user-select: none;">
                                    <input type="checkbox" checked style="accent-color: #10b981; width: 16px; height: 16px; cursor: pointer;" />
                                    <span>Remember login session</span>
                                </label>
                                <span style="font-size: 12.5px; color: #64748b; font-weight: 500;">V2.0 2026</span>
                            </div>
                            <button type="submit" id="btn-auth-signin" style="width: 100%; height: 48px; font-size: 15px; font-weight: 600; color: #ffffff; background: #10b981; border: 1px solid #059669; border-radius: 10px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: none;">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
                                    <polyline points="10 17 15 12 10 7"></polyline>
                                    <line x1="15" y1="12" x2="3" y2="12"></line>
                                </svg>
                                <span>Sign In</span>
                            </button>
                        </form>
                        <div style="border-top: 1px solid rgba(255,255,255,0.08); margin-top: 26px; padding-top: 18px; display: flex; align-items: center; justify-content: center; gap: 10px; color: #64748b; font-size: 12.5px; line-height: 1.5; text-align: center;">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink: 0;">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            <span>Restricted Access: Authorized MPOB Agronomy &amp; Plantation Personnel Only</span>
                        </div>
                    </div>
                </div>
            `;
            let authDiv = document.getElementById('auth-modal');
            if (!authDiv) {
                authDiv = document.createElement('div');
                authDiv.id = 'auth-modal';
                authDiv.className = 'modal-overlay';
                authDiv.setAttribute('data-portal-v6', 'true');
                authDiv.style.cssText = 'display: none; flex-direction: row; align-items: stretch; justify-content: flex-start; z-index: 9999999; position: fixed; inset: 0; background: #0c1017; padding: 0;';
                authDiv.innerHTML = portalInnerMarkup;
                document.body.appendChild(authDiv);
            } else {
                const wasOpen = authDiv.style.display === 'flex';
                authDiv.setAttribute('data-portal-v6', 'true');
                authDiv.style.cssText = `display: ${wasOpen ? 'flex' : 'none'}; flex-direction: row; align-items: stretch; justify-content: flex-start; z-index: 9999999; position: fixed; inset: 0; background: #0c1017; padding: 0;`;
                authDiv.innerHTML = portalInnerMarkup;
            }
        }
    }

    function renderFallbackSessionBanner() {
        const formSignin = document.getElementById('auth-form-signin');
        if (!formSignin) return;
        let banner = document.getElementById('auth-active-session-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'auth-active-session-banner';
            banner.style.cssText = 'display:none; align-items:center; justify-content:space-between; gap:14px; background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.35); padding:13px 16px; border-radius:10px; margin-bottom:20px; font-size:13.5px; color:#d1fae5;';
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
                        <div style="font-weight:700; font-size:14px; color:#34d399; margin-bottom:2px;">Signed in as ${name}</div>
                        <div style="font-size:12.5px; color:#94a3b8;">${comp}</div>
                    </div>
                    <button type="button" onclick="handleSignOut()" style="background:rgba(239,68,68,0.18); color:#fca5a5; border:1px solid rgba(239,68,68,0.45); border-radius:8px; padding:7px 14px; font-size:12.5px; font-weight:600; cursor:pointer; white-space:nowrap;">Sign Out</button>
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
                if (typeof window.refreshAccountDropdownUI === 'function') window.refreshAccountDropdownUI(null);
                return;
            }
            const rawUsername = (user && (user.username || user.user_metadata?.username || user.user_metadata?.full_name || user.email?.split('@')[0])) || 'Admin';
            const displayName = (rawUsername.toLowerCase() === 'admin1' || rawUsername === 'Lead Agronomist (Admin)') ? 'Admin' : rawUsername;
            const companyName = (user && (user.company || user.estate_company)) || 'Palmnex Sdn Bhd';

            if (avatarInitialsEl) avatarInitialsEl.textContent = displayName.slice(0, 2).toUpperCase();
            if (userEmailSpan) userEmailSpan.textContent = `${displayName} • ${companyName}`;
            if (typeof window.refreshAccountDropdownUI === 'function') window.refreshAccountDropdownUI(user);
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
                    let companyCode = plainUser.toLowerCase().replace(/^(?:admin)?([a-z_-]+?)(\d*)$/, '$1').replace(/\d+$/g, '') || 'client';
                    try {
                        const { data: prof } = await client
                            .from('profiles')
                            .select('username, company_code, company_name, estate_company, access_tier, storage_group')
                            .eq('id', data.user.id)
                            .maybeSingle();
                        if (prof) {
                            accessTier = String(prof.access_tier || 'A').toUpperCase();
                            companyCode = (prof.company_code || companyCode).toLowerCase().replace(/\d+$/g, '') || companyCode;
                            storageGroup = (accessTier === 'A' || accessTier === 'B')
                                ? `storage_${plainUser.toLowerCase()}`
                                : (accessTier === 'C' ? 'storage_all' : (prof.storage_group || storageGroup));
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

                // If an interactive Driver.js tutorial is currently active across pages, automatically start the steps for this page
                const pathLower = (window.location.pathname || '').toLowerCase();
                const isHomePage = (
                    pathLower === '/' ||
                    pathLower.endsWith('/index.html') ||
                    pathLower.endsWith('/development/') ||
                    pathLower.endsWith('/reada-standalone/')
                );
                const isTourActive = sessionStorage.getItem('palmnex_tour_active_v1') === 'true';
                const dontAsk = localStorage.getItem('palmnex_walkthrough_dont_ask_v1') === 'true';

                if (isTourActive && typeof window.startPalmnexDriverTourForCurrentPage === 'function') {
                    setTimeout(() => {
                        const authModal = document.getElementById('auth-modal');
                        if (!authModal || authModal.style.display !== 'flex') {
                            window.startPalmnexDriverTourForCurrentPage();
                        }
                    }, 380);
                } else if (isHomePage && !dontAsk && typeof window.openWalkthroughPromptModal === 'function') {
                    // Auto-popup Walkthrough Tour prompt ONLY on the Home page (unless "Don't ask me again" is checked)
                    setTimeout(() => {
                        const authModal = document.getElementById('auth-modal');
                        if (!authModal || authModal.style.display !== 'flex') {
                            window.openWalkthroughPromptModal();
                        }
                    }, 350);
                }
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
            const accWrap = document.getElementById('sp-account-dropdown-wrap');
            if (accWrap && !accWrap.contains(ev.target)) {
                window.closeAccountDropdown();
            }
            const searchBox = document.querySelector('.sp-search-box');
            const resultsBox = document.getElementById('sp-search-results-dropdown');
            if (searchBox && resultsBox && !searchBox.contains(ev.target)) {
                resultsBox.style.display = 'none';
            }
        });
    });
})();
