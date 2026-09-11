/**
 * StreamingCommunity PWA - iOS / Mobile / Desktop Web App
 * Features:
 * 1. Real-time Live TV Keyboard Typing (Samsung Smart TV QE65Q70R Sync)
 * 2. Full Catalog Browser (Hero Banner, Continua a Guardare, In Evidenza, Trending, Film)
 * 3. Title Details & TV Series Episode Selector
 * 4. In-App Video Player (iOS Safari Native HLS & Hls.js fallback)
 * 5. Mirror Manager & Instant TV Domain Sync
 */

(function () {
    'use strict';

    let BASE_URL = localStorage.getItem('sc_base_url') || 'https://streamingcommunityz.taxi';
    let CDN_URL = 'https://cdn.streamingcommunityz.taxi';
    const SYNC_TOPIC = 'sc_samsung_tv_mirror_casa_57';
    const WATCH_HISTORY_KEY = 'sc_pwa_watch_history_v1';

    // DOM Elements
    const viewport = document.getElementById('app-viewport');
    const catalogSections = document.getElementById('catalog-sections');
    const heroBanner = document.getElementById('hero-banner');
    const heroImg = document.getElementById('hero-img');
    const heroTitle = document.getElementById('hero-title');
    const heroPlot = document.getElementById('hero-plot');
    const heroTypeBadge = document.getElementById('hero-type-badge');
    const heroPlayBtn = document.getElementById('hero-play-btn');
    const heroInfoBtn = document.getElementById('hero-info-btn');

    // Search
    const searchInput = document.getElementById('search-input');
    const btnSearchSubmit = document.getElementById('btn-search-submit');
    const btnSearchClear = document.getElementById('btn-search-clear');
    const navTabs = document.querySelectorAll('.nav-tab');
    const btnReload = document.getElementById('btn-reload');

    // Modals
    const titleModal = document.getElementById('title-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const modalPoster = document.getElementById('modal-poster');
    const modalTitle = document.getElementById('modal-title');
    const modalYear = document.getElementById('modal-year');
    const modalScore = document.getElementById('modal-score');
    const modalType = document.getElementById('modal-type');
    const modalPlot = document.getElementById('modal-plot');
    const modalPlayMainBtn = document.getElementById('modal-play-main-btn');
    const modalSendTvBtn = document.getElementById('modal-send-tv-btn');
    const seasonsContainer = document.getElementById('seasons-container');
    const seasonsTabs = document.getElementById('seasons-tabs');
    const episodesGrid = document.getElementById('episodes-grid');

    // Player
    const playerModal = document.getElementById('player-modal');
    const appVideoPlayer = document.getElementById('app-video-player');
    const btnClosePlayer = document.getElementById('btn-close-player');

    // Settings Modal
    const settingsModal = document.getElementById('settings-modal');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const settingsUrlInput = document.getElementById('settings-url-input');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnSyncTvAction = document.getElementById('btn-sync-tv-action');
    const presetBtns = document.querySelectorAll('.preset-btn');

    // Remote Modal & TV Live Typing
    const remoteModal = document.getElementById('remote-modal');
    const btnOpenTvRemote = document.getElementById('btn-open-tv-remote');
    const btnCloseRemote = document.getElementById('btn-close-remote');
    const remoteTypingInput = document.getElementById('remote-typing-input');
    const btnRemoteSendSearch = document.getElementById('btn-remote-send-search');
    const btnRemoteClearSearch = document.getElementById('btn-remote-clear-search');
    const quickTagBtns = document.querySelectorAll('.quick-tag-btn');
    const dpadBtns = document.querySelectorAll('.dpad-btn');
    const remoteCmdBtns = document.querySelectorAll('.remote-cmd-btn');

    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.getElementById('loading-text');
    const appToast = document.getElementById('app-toast');

    let currentHeroTitle = null;
    let activeModalTitle = null;
    let activeTitleData = null;
    let hlsInstance = null;
    let currentPlayingContext = null;
    let lastHistorySaveTime = 0;
    let typingDebounceTimer = null;

    // Toast
    function showToast(msg, duration = 2500) {
        if (!appToast) return;
        appToast.textContent = msg;
        appToast.classList.add('show');
        clearTimeout(appToast._t);
        appToast._t = setTimeout(() => appToast.classList.remove('show'), duration);
    }

    // Loading Spinner
    function setLoading(isLoading, text = 'Caricamento...') {
        if (!loadingOverlay) return;
        if (isLoading) {
            loadingText.textContent = text;
            loadingOverlay.classList.remove('hidden');
        } else {
            loadingOverlay.classList.add('hidden');
        }
    }

    // Image helper
    function getImgUrl(filename, fallback = '') {
        if (!filename) return fallback;
        if (filename.startsWith('http')) return filename;
        return CDN_URL + '/images/' + filename;
    }

    function getTitlePoster(images, type = 'poster') {
        if (!images || !Array.isArray(images) || images.length === 0) return '';
        const found = images.find(img => img.type === type) || images[0];
        return getImgUrl(found.filename);
    }

    function formatTime(totalSec) {
        if (!totalSec || isNaN(totalSec) || totalSec < 0) return '00:00:00';
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = Math.floor(totalSec % 60);
        const pad = n => (n < 10 ? '0' + n : n);
        if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
        return `${pad(m)}:${pad(s)}`;
    }

    // =========================================================================
    // Real-Time TV Sync & Live Keyboard Communication (ntfy.sh)
    // =========================================================================

    async function sendMsgToSamsungTV(payload, showFeedback = false) {
        try {
            const bodyStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
            const res = await fetch(`https://ntfy.sh/${SYNC_TOPIC}`, {
                method: 'POST',
                body: bodyStr,
                headers: {
                    'Title': 'SC_REMOTE',
                    'Priority': 'urgent',
                    'Tags': 'tv,keyboard,satellite',
                    'X-Cache': 'yes'
                }
            });
            if (showFeedback) {
                if (res.ok) showToast('✔ Trasmesso alla Smart TV');
                else showToast('Errore trasmissione: ' + res.status);
            }
        } catch (err) {
            console.warn('[Sync] Send error:', err);
            if (showFeedback) showToast('Errore connessione TV: ' + err.message);
        }
    }

    function sendLiveTypingToTV(query) {
        clearTimeout(typingDebounceTimer);
        typingDebounceTimer = setTimeout(() => {
            console.log('[Live Keyboard] Sending to TV:', query);
            sendMsgToSamsungTV({
                action: 'search_input',
                query: query
            });
        }, 90);
    }

    function sendSearchSubmitToTV(query) {
        console.log('[Live Keyboard] Submit to TV:', query);
        sendMsgToSamsungTV({
            action: 'search_submit',
            query: query
        }, true);
    }

    function sendSearchClearToTV() {
        console.log('[Live Keyboard] Clear TV');
        sendMsgToSamsungTV({
            action: 'search_clear'
        }, true);
    }

    function sendRemoteCmdToTV(cmd) {
        console.log('[Remote] Sending cmd to TV:', cmd);
        sendMsgToSamsungTV({
            action: 'remote_cmd',
            cmd: cmd
        });
        showToast('Comando TV: ' + cmd.toUpperCase(), 1200);
    }

    // =========================================================================
    // Watch History & Continue Watching Engine
    // =========================================================================

    function getWatchHistory() {
        try {
            const raw = localStorage.getItem(WATCH_HISTORY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) {
            return [];
        }
    }

    function saveWatchHistory(list) {
        try {
            localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(list.slice(0, 30)));
        } catch (e) {}
    }

    function updateWatchProgress(context, force = false) {
        if (!context || !context.titleId) return;
        let curTime = 0;
        let duration = 3600;
        if (appVideoPlayer) {
            curTime = appVideoPlayer.currentTime || 0;
            if (appVideoPlayer.duration && !isNaN(appVideoPlayer.duration) && appVideoPlayer.duration > 0) {
                duration = appVideoPlayer.duration;
            }
        }

        const now = Date.now();
        if (!force && (now - lastHistorySaveTime < 2000)) return;
        lastHistorySaveTime = now;

        const progressPct = Math.round((curTime / duration) * 100);
        const key = context.episodeId ? (context.titleId + '_ep_' + context.episodeId) : (context.titleId + '_movie');
        const history = getWatchHistory();

        if (progressPct >= 96) {
            const filtered = history.filter(item => item.key !== key);
            saveWatchHistory(filtered);
            return;
        }

        const itemEntry = {
            key: key,
            titleId: context.titleId,
            slug: context.slug || '',
            titleName: context.titleName || 'Titolo',
            type: context.type || 'movie',
            poster: context.poster || '',
            backdrop: context.backdrop || '',
            episodeId: context.episodeId || null,
            seasonNumber: context.seasonNumber || null,
            episodeNumber: context.episodeNumber || null,
            episodeName: context.episodeName || null,
            epLabel: context.epLabel || (context.type === 'tv' ? 'Episodio' : 'Film Completo'),
            currentTime: Math.floor(curTime),
            duration: Math.floor(duration),
            progressPct: progressPct,
            lastWatched: now
        };

        const existingIdx = history.findIndex(item => item.key === key);
        if (existingIdx !== -1) history[existingIdx] = itemEntry;
        else history.unshift(itemEntry);

        history.sort((a, b) => b.lastWatched - a.lastWatched);
        saveWatchHistory(history);
    }

    function removeWatchProgress(key) {
        const history = getWatchHistory();
        const filtered = history.filter(item => item.key !== key);
        saveWatchHistory(filtered);
        renderContinueWatchingSection();
    }

    function renderContinueWatchingSection() {
        let cwRow = document.getElementById('continue-watching-row');
        const history = getWatchHistory();

        if (!history || history.length === 0) {
            if (cwRow) cwRow.remove();
            return;
        }

        if (!cwRow) {
            cwRow = document.createElement('div');
            cwRow.id = 'continue-watching-row';
            cwRow.className = 'section-row continue-watching-section';
            if (catalogSections.firstChild) {
                catalogSections.insertBefore(cwRow, catalogSections.firstChild);
            } else {
                catalogSections.appendChild(cwRow);
            }
        }

        cwRow.innerHTML = '';

        const titleEl = document.createElement('h2');
        titleEl.className = 'section-title';
        titleEl.textContent = '⏳ Continua a Guardare';
        cwRow.appendChild(titleEl);

        const carouselDiv = document.createElement('div');
        carouselDiv.className = 'cw-carousel';

        history.forEach(item => {
            const card = document.createElement('div');
            card.className = 'cw-card';

            const bgImg = item.backdrop || item.poster || '';
            card.innerHTML = `
                <div class="cw-img-wrap">
                    <img src="${bgImg}" alt="${item.titleName}" onerror="this.src='icon-192.png'">
                    <div class="cw-play-badge">▶</div>
                    <button class="cw-delete-btn" title="Rimuovi">✕</button>
                </div>
                <div class="cw-info">
                    <div class="cw-title">${item.titleName}</div>
                    <div class="cw-ep">${item.epLabel} • ${formatTime(item.currentTime)}</div>
                </div>
                <div class="cw-progress-bar">
                    <div class="cw-progress-fill" style="width: ${item.progressPct || 0}%;"></div>
                </div>
            `;

            card.querySelector('.cw-delete-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                removeWatchProgress(item.key);
            });

            card.addEventListener('click', () => {
                if (item.type === 'tv' && item.episodeId) {
                    playEpisode(item.titleId, item.episodeId, item.titleName, item.epLabel, item.currentTime, item);
                } else {
                    playMovie(item.titleId, true, item.currentTime, item);
                }
            });

            carouselDiv.appendChild(card);
        });

        cwRow.appendChild(carouselDiv);
    }

    // =========================================================================
    // Catalog & Title Data Fetching
    // =========================================================================

    async function fetchPageData(path) {
        setLoading(true, 'Caricamento catalogo...');
        try {
            const url = `${BASE_URL}${path}`;
            const res = await fetch(url, {
                headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'default' }
            });

            if (res.ok) {
                const text = await res.text();
                try {
                    const json = JSON.parse(text);
                    setLoading(false);
                    return json.props;
                } catch (e) {
                    return parseHtmlFallback(text);
                }
            } else {
                const htmlRes = await fetch(url);
                const html = await htmlRes.text();
                return parseHtmlFallback(html);
            }
        } catch (err) {
            console.error('[Fetch] Error:', err);
            setLoading(false);
            showToast('Errore di connessione a StreamingCommunity');
            return null;
        }
    }

    function parseHtmlFallback(html) {
        setLoading(false);
        const match = html.match(/data-page="([^"]+)"/);
        if (match) {
            try {
                const decoded = match[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
                const data = JSON.parse(decoded);
                return data.props;
            } catch (e) {}
        }
        return null;
    }

    async function loadCatalog(path = '/it') {
        const props = await fetchPageData(path);
        if (!props) return;

        heroBanner.style.display = 'flex';
        catalogSections.innerHTML = '';

        renderContinueWatchingSection();

        // Hero Banner
        if (props.slider && props.slider.length > 0) {
            currentHeroTitle = props.slider[0];
            heroTitle.textContent = currentHeroTitle.name || currentHeroTitle.title || 'Titolo';
            heroPlot.textContent = currentHeroTitle.plot || 'Nessuna trama disponibile.';
            heroTypeBadge.textContent = (currentHeroTitle.type === 'tv' || currentHeroTitle.seasons_count) ? 'SERIE TV' : 'FILM';
            heroImg.src = getTitlePoster(currentHeroTitle.images, 'background') || getTitlePoster(currentHeroTitle.images, 'poster');
        }

        // Titles / Sliders / Rows
        if (props.titles && Array.isArray(props.titles) && props.titles.length > 0) {
            renderSectionRow('Ultimi Arrivi & Novità', props.titles);
        }

        if (props.sliders && Array.isArray(props.sliders)) {
            props.sliders.forEach(s => {
                if (s.titles && s.titles.length > 0) {
                    renderSectionRow(s.label || s.name || 'In Evidenza', s.titles);
                }
            });
        }

        if (props.genres && Array.isArray(props.genres)) {
            props.genres.forEach(g => {
                if (g.titles && g.titles.length > 0) {
                    renderSectionRow(g.name || 'Genere', g.titles);
                }
            });
        }
    }

    function renderSectionRow(title, titlesList) {
        const sectionRow = document.createElement('div');
        sectionRow.className = 'section-row';

        const titleEl = document.createElement('h2');
        titleEl.className = 'section-title';
        titleEl.textContent = title;
        sectionRow.appendChild(titleEl);

        const carouselDiv = document.createElement('div');
        carouselDiv.className = 'cards-carousel';

        titlesList.forEach(item => {
            const card = document.createElement('div');
            card.className = 'title-card';

            const posterUrl = getTitlePoster(item.images, 'poster');
            const score = item.score ? `★ ${parseFloat(item.score).toFixed(1)}` : '';

            card.innerHTML = `
                <img src="${posterUrl}" alt="${item.name || item.title}" loading="lazy" onerror="this.src='icon-192.png'">
                ${score ? `<span class="card-score">${score}</span>` : ''}
            `;

            card.addEventListener('click', () => openTitleDetails(item));
            carouselDiv.appendChild(card);
        });

        sectionRow.appendChild(carouselDiv);
        catalogSections.appendChild(sectionRow);
    }

    // Search Engine
    async function searchTitles(query) {
        if (!query || !query.trim()) {
            loadCatalog('/it');
            return;
        }

        const q = query.trim();
        setLoading(true, `Ricerca "${q}"...`);
        heroBanner.style.display = 'none';
        catalogSections.innerHTML = '';

        try {
            const searchUrl = `${BASE_URL}/it/archive?search=${encodeURIComponent(q)}`;
            const res = await fetch(searchUrl, {
                headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'default' }
            });

            let titlesFound = [];
            if (res.ok) {
                const json = await res.json();
                if (json.props && json.props.titles) {
                    titlesFound = Array.isArray(json.props.titles) ? json.props.titles : (json.props.titles.data || []);
                }
            }

            setLoading(false);

            if (titlesFound.length === 0) {
                catalogSections.innerHTML = `
                    <div style="text-align:center; padding: 40px 16px;">
                        <h2 style="font-size:20px; color:#ff5252;">Nessun risultato per "${q}"</h2>
                        <p style="color:#8b949e; margin-top:8px;">Prova a cercare con un altro termine o verifica l'indirizzo del sito.</p>
                    </div>
                `;
            } else {
                renderSectionRow(`Risultati ricerca per "${q}" (${titlesFound.length})`, titlesFound);
            }
        } catch (err) {
            setLoading(false);
            showToast('Errore durante la ricerca');
        }
    }

    // =========================================================================
    // Title Details & TV Series Episode Browser
    // =========================================================================

    async function openTitleDetails(titleObj) {
        activeModalTitle = titleObj;
        activeTitleData = null;

        modalTitle.textContent = titleObj.name || titleObj.title || 'Titolo';
        modalPlot.textContent = titleObj.plot || 'Trama in caricamento...';
        modalYear.textContent = titleObj.release_date ? titleObj.release_date.split('-')[0] : '2024';
        modalScore.textContent = titleObj.score ? `★ ${parseFloat(titleObj.score).toFixed(1)}` : '★ 8.0';
        modalType.textContent = (titleObj.type === 'tv' || titleObj.seasons_count) ? 'SERIE TV' : 'FILM';
        modalPoster.src = getTitlePoster(titleObj.images, 'poster');

        seasonsContainer.classList.add('hidden');
        titleModal.classList.remove('hidden');

        // Fetch full title metadata
        try {
            const detailUrl = `${BASE_URL}/it/titles/${titleObj.id}-${titleObj.slug || 'slug'}`;
            const res = await fetch(detailUrl, {
                headers: { 'X-Inertia': 'true', 'X-Inertia-Version': 'default' }
            });

            if (res.ok) {
                const json = await res.json();
                if (json.props && json.props.title) {
                    activeTitleData = json.props.title;
                    if (activeTitleData.plot) modalPlot.textContent = activeTitleData.plot;

                    if (activeTitleData.seasons && activeTitleData.seasons.length > 0) {
                        renderSeasonsSelector(activeTitleData.seasons);
                    }
                }
            }
        } catch (err) {
            console.warn('[Details] Fetch error:', err);
        }
    }

    function renderSeasonsSelector(seasons) {
        seasonsTabs.innerHTML = '';
        seasonsContainer.classList.remove('hidden');

        seasons.forEach((season, idx) => {
            const btn = document.createElement('button');
            btn.className = `season-tab-btn ${idx === 0 ? 'active' : ''}`;
            btn.textContent = `Stagione ${season.number || (idx + 1)}`;
            btn.addEventListener('click', () => {
                document.querySelectorAll('.season-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderEpisodesGrid(season.episodes || [], season.number);
            });
            seasonsTabs.appendChild(btn);
        });

        if (seasons.length > 0) {
            renderEpisodesGrid(seasons[0].episodes || [], seasons[0].number);
        }
    }

    function renderEpisodesGrid(episodes, seasonNum = 1) {
        episodesGrid.innerHTML = '';

        if (!episodes || episodes.length === 0) {
            episodesGrid.innerHTML = '<div style="color:#8b949e; font-size:12px; padding:10px;">Nessun episodio trovato.</div>';
            return;
        }

        episodes.forEach(ep => {
            const card = document.createElement('div');
            card.className = 'episode-card';

            const epImg = ep.images && ep.images.length > 0 ? getImgUrl(ep.images[0].filename) : (modalPoster.src || 'icon-192.png');
            const epNum = ep.number || ep.episode_number || 1;
            const epName = ep.name || ep.title || `Episodio ${epNum}`;

            card.innerHTML = `
                <div class="episode-thumb-wrap">
                    <img src="${epImg}" alt="${epName}" onerror="this.src='icon-192.png'">
                    <div class="episode-play-icon">▶</div>
                </div>
                <div class="episode-info">
                    <div class="episode-title">S${seasonNum} E${epNum} - ${epName}</div>
                    <div class="episode-meta">${ep.duration ? Math.floor(ep.duration / 60) + ' min' : 'Guarda ora'}</div>
                </div>
            `;

            card.addEventListener('click', () => {
                titleModal.classList.add('hidden');
                playEpisode(activeModalTitle.id, ep.id, activeModalTitle.name || activeModalTitle.title, `S${seasonNum} E${epNum}`, 0, {
                    titleId: activeModalTitle.id,
                    slug: activeModalTitle.slug,
                    titleName: activeModalTitle.name || activeModalTitle.title,
                    type: 'tv',
                    poster: modalPoster.src,
                    episodeId: ep.id,
                    seasonNumber: seasonNum,
                    episodeNumber: epNum,
                    episodeName: epName
                });
            });

            episodesGrid.appendChild(card);
        });
    }

    // =========================================================================
    // Video Player & Stream Extractor
    // =========================================================================

    async function extractMasterPlaylist(iframeUrl) {
        const res = await fetch(iframeUrl);
        const html = await res.text();

        // 1. Check window.masterPlaylist
        const masterMatch = html.match(/masterPlaylist\s*=\s*['"]([^'"]+)['"]/);
        if (masterMatch) {
            let url = masterMatch[1].replace(/\\/g, '');
            if (url.startsWith('//')) url = 'https:' + url;
            return url;
        }

        // 2. Check vixcloud embed iframe
        const iframeMatch = html.match(/<iframe[^>]+src="([^"]+)"/i);
        if (iframeMatch) {
            let embedUrl = iframeMatch[1];
            if (embedUrl.startsWith('//')) embedUrl = 'https:' + embedUrl;
            return await extractMasterPlaylist(embedUrl);
        }

        // 3. Fallback direct playlist match
        const m3u8Match = html.match(/(https?:\/\/[^"']+\.m3u8[^"']*)/i);
        if (m3u8Match) {
            return m3u8Match[1].replace(/\\/g, '');
        }

        throw new Error('Nessun flusso video trovato nella pagina');
    }

    async function playMovie(titleId, isResume = false, resumeTime = 0, customContext = null) {
        setLoading(true, 'Caricamento film...');
        try {
            const iframeUrl = `${BASE_URL}/it/iframe/${titleId}`;
            const m3u8Url = await extractMasterPlaylist(iframeUrl);
            setLoading(false);

            currentPlayingContext = customContext || {
                titleId: titleId,
                titleName: activeModalTitle ? (activeModalTitle.name || activeModalTitle.title) : 'Film',
                type: 'movie',
                poster: activeModalTitle ? getTitlePoster(activeModalTitle.images, 'poster') : '',
                currentTime: resumeTime
            };

            launchVideoPlayer(m3u8Url, resumeTime);
        } catch (err) {
            setLoading(false);
            showToast('Errore avvio video: ' + err.message);
        }
    }

    async function playEpisode(titleId, episodeId, titleName, epLabel, resumeTime = 0, customContext = null) {
        setLoading(true, `Caricamento ${epLabel}...`);
        try {
            const iframeUrl = `${BASE_URL}/it/iframe/${titleId}?episode_id=${episodeId}`;
            const m3u8Url = await extractMasterPlaylist(iframeUrl);
            setLoading(false);

            currentPlayingContext = customContext || {
                titleId: titleId,
                episodeId: episodeId,
                titleName: titleName,
                epLabel: epLabel,
                type: 'tv',
                poster: activeModalTitle ? getTitlePoster(activeModalTitle.images, 'poster') : '',
                currentTime: resumeTime
            };

            launchVideoPlayer(m3u8Url, resumeTime);
        } catch (err) {
            setLoading(false);
            showToast('Errore avvio episodio: ' + err.message);
        }
    }

    function launchVideoPlayer(m3u8Url, startTime = 0) {
        playerModal.classList.remove('hidden');

        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }

        // Native HLS for Safari iOS & WebKit
        if (appVideoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
            appVideoPlayer.src = m3u8Url;
            appVideoPlayer.addEventListener('loadedmetadata', function onMeta() {
                appVideoPlayer.removeEventListener('loadedmetadata', onMeta);
                if (startTime > 5) appVideoPlayer.currentTime = startTime;
                appVideoPlayer.play().catch(() => {});
            });
            appVideoPlayer.play().catch(() => {});
        } else if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hlsInstance = new Hls({ enableWorker: true, lowLatencyMode: true });
            hlsInstance.loadSource(m3u8Url);
            hlsInstance.attachMedia(appVideoPlayer);
            hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
                if (startTime > 5) appVideoPlayer.currentTime = startTime;
                appVideoPlayer.play().catch(() => {});
            });
        } else {
            appVideoPlayer.src = m3u8Url;
            appVideoPlayer.play().catch(() => {});
        }
    }

    function closeVideoPlayer() {
        if (appVideoPlayer) {
            appVideoPlayer.pause();
            appVideoPlayer.removeAttribute('src');
            appVideoPlayer.load();
        }
        if (hlsInstance) {
            hlsInstance.destroy();
            hlsInstance = null;
        }
        currentPlayingContext = null;
        playerModal.classList.add('hidden');
        renderContinueWatchingSection();
    }

    if (appVideoPlayer) {
        appVideoPlayer.addEventListener('timeupdate', () => {
            if (currentPlayingContext) updateWatchProgress(currentPlayingContext, false);
        });
        appVideoPlayer.addEventListener('pause', () => {
            if (currentPlayingContext) updateWatchProgress(currentPlayingContext, true);
        });
        appVideoPlayer.addEventListener('ended', () => {
            if (currentPlayingContext) {
                const key = currentPlayingContext.episodeId ? (currentPlayingContext.titleId + '_ep_' + currentPlayingContext.episodeId) : (currentPlayingContext.titleId + '_movie');
                removeWatchProgress(key);
            }
            closeVideoPlayer();
        });
    }

    // =========================================================================
    // Event Listeners & UI Handlers
    // =========================================================================

    // Live Typing Search Bar
    searchInput.addEventListener('input', () => {
        const val = searchInput.value;
        if (val) btnSearchClear.classList.remove('hidden');
        else btnSearchClear.classList.add('hidden');

        // Real-time synchronization to Samsung TV!
        sendLiveTypingToTV(val);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = searchInput.value;
            sendSearchSubmitToTV(val);
            searchTitles(val);
        }
    });

    btnSearchSubmit.addEventListener('click', () => {
        const val = searchInput.value;
        sendSearchSubmitToTV(val);
        searchTitles(val);
    });

    btnSearchClear.addEventListener('click', () => {
        searchInput.value = '';
        btnSearchClear.classList.add('hidden');
        sendSearchClearToTV();
        loadCatalog('/it');
    });

    // Remote Modal & TV Live Keyboard
    btnOpenTvRemote.addEventListener('click', () => {
        remoteTypingInput.value = searchInput.value;
        remoteModal.classList.remove('hidden');
        setTimeout(() => remoteTypingInput.focus(), 150);
    });

    btnCloseRemote.addEventListener('click', () => remoteModal.classList.add('hidden'));

    remoteTypingInput.addEventListener('input', () => {
        const val = remoteTypingInput.value;
        searchInput.value = val;
        if (val) btnSearchClear.classList.remove('hidden');
        else btnSearchClear.classList.add('hidden');
        sendLiveTypingToTV(val);
    });

    remoteTypingInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = remoteTypingInput.value;
            sendSearchSubmitToTV(val);
            searchTitles(val);
            remoteModal.classList.add('hidden');
        }
    });

    btnRemoteSendSearch.addEventListener('click', () => {
        const val = remoteTypingInput.value;
        sendSearchSubmitToTV(val);
        searchTitles(val);
        remoteModal.classList.add('hidden');
    });

    btnRemoteClearSearch.addEventListener('click', () => {
        remoteTypingInput.value = '';
        searchInput.value = '';
        btnSearchClear.classList.add('hidden');
        sendSearchClearToTV();
        loadCatalog('/it');
    });

    quickTagBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.textContent.trim();
            remoteTypingInput.value = tag;
            searchInput.value = tag;
            btnSearchClear.classList.remove('hidden');
            sendSearchSubmitToTV(tag);
            searchTitles(tag);
            remoteModal.classList.add('hidden');
        });
    });

    // D-Pad and Remote buttons
    dpadBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.getAttribute('data-cmd');
            sendRemoteCmdToTV(cmd);
        });
    });

    remoteCmdBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.getAttribute('data-cmd');
            sendRemoteCmdToTV(cmd);
        });
    });

    // Mirror / Settings Modal
    btnOpenSettings.addEventListener('click', () => {
        settingsUrlInput.value = BASE_URL;
        settingsModal.classList.remove('hidden');
    });

    btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

    presetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            settingsUrlInput.value = btn.getAttribute('data-url');
        });
    });

    btnSyncTvAction.addEventListener('click', async () => {
        let val = settingsUrlInput.value.trim();
        if (!val.startsWith('http')) val = 'https://' + val;
        val = val.replace(/\/+$/, '');
        BASE_URL = val;
        localStorage.setItem('sc_base_url', BASE_URL);
        const domain = BASE_URL.replace(/^https?:\/\//, '');
        CDN_URL = `https://cdn.${domain}`;
        settingsModal.classList.add('hidden');

        setLoading(true, 'Invio nuovo mirror alla Smart TV...');
        await sendMsgToSamsungTV(BASE_URL, true);
        setLoading(false);

        loadCatalog('/it');
    });

    btnSaveSettings.addEventListener('click', () => {
        let val = settingsUrlInput.value.trim();
        if (!val.startsWith('http')) val = 'https://' + val;
        val = val.replace(/\/+$/, '');
        BASE_URL = val;
        localStorage.setItem('sc_base_url', BASE_URL);
        const domain = BASE_URL.replace(/^https?:\/\//, '');
        CDN_URL = `https://cdn.${domain}`;
        settingsModal.classList.add('hidden');
        showToast('Indirizzo salvato sulla PWA!');
        loadCatalog('/it');
    });

    // Modals
    btnCloseModal.addEventListener('click', () => titleModal.classList.add('hidden'));
    btnClosePlayer.addEventListener('click', closeVideoPlayer);
    btnReload.addEventListener('click', () => loadCatalog('/it'));

    modalPlayMainBtn.addEventListener('click', () => {
        if (activeModalTitle) {
            titleModal.classList.add('hidden');
            if (activeModalTitle.type === 'tv' || activeModalTitle.seasons_count) {
                // If TV series, check first episode or progress
                const firstEp = (activeTitleData && activeTitleData.seasons && activeTitleData.seasons[0] && activeTitleData.seasons[0].episodes && activeTitleData.seasons[0].episodes[0]) ? activeTitleData.seasons[0].episodes[0].id : 1;
                playEpisode(activeModalTitle.id, firstEp, activeModalTitle.name || activeModalTitle.title, 'Stagione 1 Ep 1');
            } else {
                playMovie(activeModalTitle.id);
            }
        }
    });

    modalSendTvBtn.addEventListener('click', () => {
        if (activeModalTitle) {
            const q = activeModalTitle.name || activeModalTitle.title;
            sendSearchSubmitToTV(q);
            showToast(`📺 Titolo inviato alla TV: ${q}`);
        }
    });

    heroPlayBtn.addEventListener('click', () => {
        if (currentHeroTitle) {
            if (currentHeroTitle.type === 'tv' || currentHeroTitle.seasons_count) {
                openTitleDetails(currentHeroTitle);
            } else {
                playMovie(currentHeroTitle.id);
            }
        }
    });

    heroInfoBtn.addEventListener('click', () => {
        if (currentHeroTitle) openTitleDetails(currentHeroTitle);
    });

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            navTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const path = tab.getAttribute('data-path') || '/it';
            loadCatalog(path);
        });
    });

    // Startup
    window.addEventListener('load', () => {
        const domain = BASE_URL.replace(/^https?:\/\//, '');
        CDN_URL = `https://cdn.${domain}`;
        loadCatalog('/it');
    });

})();
