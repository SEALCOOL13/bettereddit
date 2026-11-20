/* Carbon for old reddit: applies settings and adds the reading features.
   Runs at document_start; features start once the page is parsed. */
(() => {
    'use strict';

    let root = document.documentElement;
    const CACHE_KEY = 'carbon-settings';
    let settings = Object.assign({}, CB_DEFAULTS);
    let started = false;
    let showFiltered = false;   // per page: reveal posts hidden by filters

    /* ---------------------------------------------------------------- */
    /* Settings -> classes and variables on <html>                        */
    /* ---------------------------------------------------------------- */

    function applySettings(s) {
        if (!root) {
            // <html> does not exist yet at document_start in some cases; apply as soon as it does
            const mo = new MutationObserver(() => {
                if (!document.documentElement) return;
                mo.disconnect();
                root = document.documentElement;
                applySettings(settings);
            });
            mo.observe(document, { childList: true });
            return;
        }
        const keep = [...root.classList].filter(c => !c.startsWith('cb-'));
        const add = ['cb-theme-' + s.theme];
        if (s.font === 'system') add.push('cb-font-system');
        if (s.font === 'verdana') add.push('cb-font-verdana');
        if (s.font === 'custom' && cbFontList(s.fontCustom)) add.push('cb-font-custom');
        if (cbFontList(s.monoCustom)) add.push('cb-mono-custom');
        if (s.density === 'compact') add.push('cb-compact');
        for (const k of CB_ON_BY_DEFAULT) if (!s[k]) add.push('cb-off-' + k);
        for (const k of CB_OFF_BY_DEFAULT) if (s[k]) add.push('cb-on-' + k);
        if (s.hideSidebar) add.push('cb-hide-sidebar');
        if (s.lineCollapse) add.push('cb-line-collapse');
        if (s.flairStyle === 'full') add.push('cb-flair-full');
        if (s.flairStyle === 'hide') add.push('cb-flair-hide');
        if (showFiltered) add.push('cb-show-filtered');
        root.className = keep.concat(add).join(' ');

        const set = (name, value) => value ? root.style.setProperty(name, value) : root.style.removeProperty(name);
        set('--cb-accent', /^#[0-9a-f]{6}$/i.test(s.accent) ? s.accent : '');
        set('--cb-link', /^#[0-9a-f]{6}$/i.test(s.link) ? s.link : '');
        set('--cb-md-size', Number(s.textSize) ? Number(s.textSize) + 'px' : '');
        set('--cb-md-lh', Number(s.lineHeight) ? String(Number(s.lineHeight)) : '');
        set('--cb-font-custom', s.font === 'custom' ? cbFontList(s.fontCustom) : '');
        set('--cb-mono-custom', cbFontList(s.monoCustom));
    }

    // 1. last known settings, synchronously, so the page never flashes the wrong theme
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) settings = Object.assign({}, CB_DEFAULTS, JSON.parse(cached));
    } catch (e) { /* storage blocked */ }
    applySettings(settings);

    // 2. the real settings
    cbLoadSettings().then(s => {
        settings = s;
        applySettings(s);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
        if (started) refreshFeatures();
    });

    cbApi.storage.onChanged.addListener((changes, area) => {
        if (area !== 'sync') return;
        for (const [k, v] of Object.entries(changes)) {
            settings[k] = v.newValue === undefined ? CB_DEFAULTS[k] : v.newValue;
        }
        applySettings(settings);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
        if (started) refreshFeatures();
    });

    function save(patch) {
        Object.assign(settings, patch);
        applySettings(settings);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(settings)); } catch (e) { /* ignore */ }
        cbSaveSettings(patch);
        refreshFeatures();
    }

    /* ---------------------------------------------------------------- */
    /* Helpers                                                            */
    /* ---------------------------------------------------------------- */

    const isOldReddit = () => !!document.getElementById('header-bottom-left');
    const isCommentsPage = () => document.body && document.body.classList.contains('comments-page');
    const isListing = () => !!document.querySelector('#siteTable.linklisting, .content > .spacer > #siteTable') && !isCommentsPage();
    const resRunning = () => root.classList.contains('res') || (document.body && document.body.classList.contains('res'));
    const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ICONS = {
        sidebar: '<path d="M4 5h16v14H4zM15 5v14"/>',
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
        moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
        auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16a8 8 0 0 0 0-16z" fill="currentColor"/>',
        up: '<path d="m6 15 6-6 6 6"/>',
        down: '<path d="m6 9 6 6 6-6"/>',
        newer: '<circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none"/><path d="M12 3v3M12 18v3"/>',
        expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
        collapse: '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
        top: '<path d="M5 5h14M12 9v11M7 14l5-5 5 5"/>'
    };

    const svgParser = new DOMParser();

    function icon(name) {
        const markup = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
            'stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            ICONS[name] + '</svg>';
        return document.importNode(svgParser.parseFromString(markup, 'image/svg+xml').documentElement, true);
    }

    function button(cls, iconName, label, onClick) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = cls;
        b.title = label;
        b.setAttribute('aria-label', label);
        b.appendChild(icon(iconName));
        b.addEventListener('click', onClick);
        return b;
    }

    function scrollToThing(el) {
        const header = document.getElementById('header');
        const sticky = root.classList.contains('cb-on-stickyHeader') && header ? header.offsetHeight : 0;
        const top = el.getBoundingClientRect().top + window.scrollY - sticky - 12;
        window.scrollTo({ top, behavior: reduceMotion() ? 'auto' : 'smooth' });
        el.classList.remove('cb-flash');
        void el.offsetWidth;
        el.classList.add('cb-flash');
    }

    /* ---------------------------------------------------------------- */
    /* Header tools: sidebar and theme buttons                            */
    /* ---------------------------------------------------------------- */

    const THEMES = ['dark', 'light', 'auto'];
    const THEME_LABEL = { dark: 'Carbon (dark)', light: 'Paper (light)', auto: 'Follow system' };
    const THEME_ICON = { dark: 'moon', light: 'sun', auto: 'auto' };

    function headerTools() {
        let box = document.querySelector('.cb-tools');
        if (!settings.headerTools) { if (box) box.remove(); return; }
        const right = document.getElementById('header-bottom-right');
        if (!right) return;
        if (!box) {
            box = document.createElement('span');
            box.className = 'cb-tools';
            right.insertBefore(box, right.firstChild);
        }
        box.textContent = '';
        if (document.querySelector('body > .side')) {
            const hidden = settings.hideSidebar;
            const b = button('cb-tool' + (hidden ? ' is-on' : ''), 'sidebar', hidden ? 'Show sidebar' : 'Hide sidebar',
                () => save({ hideSidebar: !settings.hideSidebar }));
            b.setAttribute('aria-pressed', String(hidden));
            box.appendChild(b);
        }
        if (settings.expandAllButton && isListing() && document.querySelector('.thing.link .expando-button')) {
            const open = !!document.querySelector('.thing.link .expando-button.expanded');
            box.appendChild(button('cb-tool' + (open ? ' is-on' : ''), open ? 'collapse' : 'expand',
                open ? 'Collapse all media' : 'Expand all media', toggleAllMedia));
        }
        const next = THEMES[(THEMES.indexOf(settings.theme) + 1) % THEMES.length];
        box.appendChild(button('cb-tool', THEME_ICON[settings.theme] || 'moon',
            'Theme: ' + (THEME_LABEL[settings.theme] || settings.theme) + '. Switch to ' + THEME_LABEL[next],
            () => save({ theme: next })));
    }

    /* ---------------------------------------------------------------- */
    /* New comments since your last visit                                 */
    /* ---------------------------------------------------------------- */

    const VISITS_KEY = 'visits';
    const MAX_VISITS = 1500;
    let lastVisit = null;     // ms of the previous visit to this thread, or null
    let visitLoaded = false;
    let me = '';

    function threadId() {
        const m = location.pathname.match(/\/comments\/([a-z0-9]+)/i);
        return m ? m[1].toLowerCase() : null;
    }

    function loadVisit() {
        const id = threadId();
        if (!id || visitLoaded) return Promise.resolve();
        visitLoaded = true;
        return cbStorageGet('local', VISITS_KEY).then(data => {
            const visits = (data && data[VISITS_KEY]) || {};
            lastVisit = typeof visits[id] === 'number' ? visits[id] : null;
            visits[id] = Date.now();
            const ids = Object.keys(visits);
            if (ids.length > MAX_VISITS) {
                ids.sort((x, y) => visits[x] - visits[y])
                    .slice(0, ids.length - MAX_VISITS)
                    .forEach(k => delete visits[k]);
            }
            cbStorageSet('local', { [VISITS_KEY]: visits });
        });
    }

    function markNewComments() {
        if (!settings.newComments || lastVisit === null) return;
        for (const c of document.querySelectorAll('.commentarea .thing.comment:not(.cb-seen)')) {
            c.classList.add('cb-seen');
            const t = c.querySelector(':scope > .entry .tagline time.live-timestamp');
            const author = c.querySelector(':scope > .entry .tagline a.author');
            if (!t) continue;
            const when = Date.parse(t.getAttribute('datetime'));
            if (!(when > lastVisit)) continue;
            if (me && author && author.textContent === me) continue;
            c.classList.add('cb-new');
            const tag = document.createElement('span');
            tag.className = 'cb-new-tag';
            tag.textContent = 'new';
            t.after(tag);
        }
        updateNewCount();
    }

    function relTime(ms) {
        const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
        const s = Math.round((ms - Date.now()) / 1000);
        const steps = [[60, 'second'], [60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month'], [Infinity, 'year']];
        let v = s;
        for (const [size, unit] of steps) {
            if (Math.abs(v) < size) return rtf.format(v, unit);
            v = Math.round(v / size);
        }
        return '';
    }

    function updateNewCount() {
        const title = document.querySelector('.commentarea .panestack-title');
        let note = document.querySelector('.cb-new-count');
        const n = settings.newComments ? document.querySelectorAll('.thing.comment.cb-new').length : 0;
        if (!title || lastVisit === null || !settings.newComments) { if (note) note.remove(); return; }
        if (!note) {
            note = document.createElement('span');
            note.className = 'cb-new-count';
            title.appendChild(note);
        }
        note.textContent = n
            ? n + ' new since your last visit ' + relTime(lastVisit)
            : 'No new comments since your last visit ' + relTime(lastVisit);
        updateNav();
    }

    function clearNewComments() {
        for (const c of document.querySelectorAll('.thing.comment.cb-new')) c.classList.remove('cb-new');
        for (const t of document.querySelectorAll('.cb-new-tag')) t.remove();
        for (const c of document.querySelectorAll('.thing.comment.cb-seen')) c.classList.remove('cb-seen');
        const note = document.querySelector('.cb-new-count');
        if (note) note.remove();
    }

    /* ---------------------------------------------------------------- */
    /* Comment navigator                                                   */
    /* ---------------------------------------------------------------- */

    let nav = null;

    function visible(el) {
        return el.offsetParent !== null;
    }

    function offsetTop() {
        const header = document.getElementById('header');
        return (root.classList.contains('cb-on-stickyHeader') && header ? header.offsetHeight : 0) + 16;
    }

    function jump(list, dir) {
        const edge = offsetTop() + 2;
        const items = list.filter(visible);
        if (!items.length) return;
        let target;
        if (dir > 0) target = items.find(el => el.getBoundingClientRect().top > edge);
        else target = items.filter(el => el.getBoundingClientRect().top < edge - 4).pop();
        if (target) scrollToThing(target);
    }

    const topLevel = () => [...document.querySelectorAll('.commentarea > .sitetable > .thing.comment')];
    const newOnes = () => [...document.querySelectorAll('.commentarea .thing.comment.cb-new')];

    function commentNav() {
        if (!settings.commentNav || !isCommentsPage() || !document.querySelector('.commentarea .thing.comment')) {
            if (nav) { nav.remove(); nav = null; }
            return;
        }
        if (!nav) {
            nav = document.createElement('nav');
            nav.className = 'cb-nav';
            nav.setAttribute('aria-label', 'Comment navigation');
            nav.append(
                button('cb-nav-btn', 'up', 'Previous top-level comment', () => jump(topLevel(), -1)),
                button('cb-nav-btn', 'down', 'Next top-level comment', () => jump(topLevel(), 1)),
                button('cb-nav-btn cb-nav-new', 'newer', 'Next new comment', () => jump(newOnes(), 1))
            );
            const count = document.createElement('span');
            count.className = 'cb-nav-count';
            nav.lastChild.appendChild(count);
            document.body.appendChild(nav);
        }
        updateNav();
    }

    function updateNav() {
        if (!nav) return;
        const n = newOnes().length;
        const btn = nav.querySelector('.cb-nav-new');
        btn.hidden = n === 0;
        btn.querySelector('.cb-nav-count').textContent = n > 99 ? '99+' : String(n);
        btn.title = n + ' new comment' + (n === 1 ? '' : 's') + '. Jump to the next one';
    }

    /* ---------------------------------------------------------------- */
    /* Click a thread line to collapse that comment                        */
    /* ---------------------------------------------------------------- */

    function onLineClick(e) {
        if (!settings.lineCollapse || e.button !== 0) return;
        const child = e.target;
        if (!(child instanceof HTMLElement) || !child.classList.contains('child')) return;
        const comment = child.parentElement;
        if (!comment || !comment.classList.contains('comment')) return;
        if (e.offsetX > 10) return;
        const toggle = comment.querySelector(':scope > .entry .tagline a.expand');
        if (!toggle) return;
        e.preventDefault();
        toggle.click();
        if (comment.getBoundingClientRect().top < offsetTop()) scrollToThing(comment);
    }

    /* ---------------------------------------------------------------- */
    /* Links go straight to their site, not through reddit's redirect     */
    /* ---------------------------------------------------------------- */

    function cleanLinks(scope) {
        if (!settings.cleanLinks) return;
        for (const a of (scope || document).querySelectorAll('a[data-outbound-url], a[data-outbound-expiration]')) {
            a.removeAttribute('data-outbound-url');
            a.removeAttribute('data-outbound-expiration');
        }
    }


    /* ---------------------------------------------------------------- */
    /* Expand or collapse every post's media on a listing                 */
    /* ---------------------------------------------------------------- */

    function toggleAllMedia() {
        const open = !!document.querySelector('.thing.link .expando-button.expanded');
        const sel = open ? '.thing.link:not(.cb-filtered) .expando-button.expanded'
                         : '.thing.link:not(.cb-filtered) .expando-button.collapsed';
        for (const b of document.querySelectorAll(sel)) b.click();
        setTimeout(headerTools, 50);
    }

    /* ---------------------------------------------------------------- */
    /* Filters: hide posts by subreddit, site, title words or user        */
    /* ---------------------------------------------------------------- */

    const parseList = v => String(v || '').split(/[\n,]+/).map(x => x.trim().toLowerCase()).filter(Boolean);
    let filterBar = null;

    function filterRules() {
        return {
            subs: new Set(parseList(settings.filterSubs).map(x => x.replace(/^\/?r\//, ''))),
            domains: parseList(settings.filterDomains).map(x => x.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '')),
            words: parseList(settings.filterWords),
            users: new Set(parseList(settings.filterUsers).map(x => x.replace(/^\/?u(ser)?\//, '')))
        };
    }

    function applyFilters() {
        const r = filterRules();
        const here = (location.pathname.match(/^\/r\/([^/]+)/i) || [])[1];
        const onListing = document.body.classList.contains('listing-page') && !document.body.classList.contains('profile-page');
        let hidden = 0;
        for (const link of document.querySelectorAll('.thing.link')) {
            let reason = '';
            if (onListing) {
                const sub = (link.dataset.subreddit || '').toLowerCase();
                const dom = (link.dataset.domain || '').toLowerCase().replace(/^www\./, '');
                const author = (link.dataset.author || '').toLowerCase();
                const titleEl = link.querySelector('a.title');
                const title = titleEl ? titleEl.textContent.toLowerCase() : '';
                if (sub && r.subs.has(sub) && sub !== (here || '').toLowerCase()) reason = 'r/' + sub;
                else if (dom && r.domains.some(d => dom === d || dom.endsWith('.' + d))) reason = dom;
                else if (author && r.users.has(author)) reason = 'u/' + author;
                else {
                    const w = r.words.find(word => title.includes(word));
                    if (w) reason = '“' + w + '”';
                }
            }
            if (reason) {
                hidden++;
                link.classList.add('cb-filtered');
                link.dataset.cbReason = 'Filtered: ' + reason;
            } else if (link.classList.contains('cb-filtered')) {
                link.classList.remove('cb-filtered');
                delete link.dataset.cbReason;
            }
        }
        // comments by filtered users fold down to their header line
        for (const c of document.querySelectorAll('.thing.comment')) {
            const a = (c.dataset.author || '').toLowerCase();
            const fold = settings.filterComments && a && r.users.has(a);
            c.classList.toggle('cb-filtered-comment', !!fold);
        }
        updateFilterBar(hidden);
    }

    function updateFilterBar(hidden) {
        const table = document.getElementById('siteTable');
        if (!hidden || !table) { if (filterBar) { filterBar.remove(); filterBar = null; } return; }
        if (!filterBar) {
            filterBar = document.createElement('div');
            filterBar.className = 'cb-filter-bar';
            const text = document.createElement('span');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'cb-link-btn';
            btn.addEventListener('click', () => {
                showFiltered = !showFiltered;
                applySettings(settings);
                updateFilterBar(document.querySelectorAll('.thing.link.cb-filtered').length);
            });
            filterBar.append(text, btn);
            table.parentNode.insertBefore(filterBar, table);
        }
        filterBar.firstChild.textContent = hidden + (hidden === 1 ? ' post' : ' posts') + ' hidden by your filters';
        filterBar.lastChild.textContent = showFiltered ? 'Hide them' : 'Show them';
    }

    /* ---------------------------------------------------------------- */
    /* Exact dates instead of "3 hours ago"                                */
    /* ---------------------------------------------------------------- */

    const dateFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    function absoluteTimes() {
        for (const t of document.querySelectorAll('time[datetime]')) {
            if (settings.absoluteTime) {
                if (t.dataset.cbRel !== undefined) continue;
                const d = new Date(t.getAttribute('datetime'));
                if (isNaN(d)) continue;
                t.dataset.cbRel = t.textContent;
                t.dataset.cbLive = t.classList.contains('live-timestamp') ? '1' : '';
                t.classList.remove('live-timestamp');      // stop reddit's script rewriting it
                t.textContent = dateFmt.format(d);
                t.title = t.dataset.cbRel;
            } else if (t.dataset.cbRel !== undefined) {
                t.textContent = t.dataset.cbRel;
                if (t.dataset.cbLive) t.classList.add('live-timestamp');
                delete t.dataset.cbRel;
                delete t.dataset.cbLive;
            }
        }
    }

    /* ---------------------------------------------------------------- */
    /* Fold AutoModerator comments                                         */
    /* ---------------------------------------------------------------- */

    function collapseAutomod() {
        if (!settings.collapseAutomod || !isCommentsPage()) return;
        for (const c of document.querySelectorAll('.commentarea .thing.comment.noncollapsed[data-author="AutoModerator"]:not([data-cb-auto])')) {
            c.dataset.cbAuto = '1';
            const t = c.querySelector(':scope > .entry .tagline a.expand');
            if (t) t.click();
        }
    }

    /* ---------------------------------------------------------------- */
    /* Keyboard: j/k move, o open, c comments, x expand, a/z vote, ? help */
    /* ---------------------------------------------------------------- */

    let kbCurrent = null;
    let helpBox = null;

    function kbItems() {
        const sel = isCommentsPage()
            ? '.sitetable.linklisting > .thing.link, .commentarea .thing.comment'
            : '#siteTable > .thing.link:not(.cb-filtered), #siteTable > .thing.comment, #siteTable > .thing.message, .sitetable > .thing.link:not(.cb-filtered)';
        return [...document.querySelectorAll(sel)].filter(el => el.offsetParent !== null);
    }

    function kbSelect(el) {
        if (kbCurrent) kbCurrent.classList.remove('cb-kb-active');
        kbCurrent = el;
        if (!el) return;
        el.classList.add('cb-kb-active');
        const r = el.getBoundingClientRect();
        const top = offsetTop();
        if (r.top < top || r.bottom > innerHeight - 24) {
            window.scrollTo({ top: r.top + scrollY - top - 8, behavior: reduceMotion() ? 'auto' : 'smooth' });
        }
    }

    function kbMove(dir) {
        const items = kbItems();
        if (!items.length) return;
        let i = kbCurrent ? items.indexOf(kbCurrent) : -1;
        if (i < 0) {
            // start from the first item on screen
            i = items.findIndex(el => el.getBoundingClientRect().bottom > offsetTop());
            if (i < 0) i = 0;
            if (dir > 0 && kbCurrent) i++;
        } else {
            i = Math.max(0, Math.min(items.length - 1, i + dir));
        }
        kbSelect(items[i]);
    }

    function kbClick(selector) {
        if (!kbCurrent) return false;
        const el = kbCurrent.querySelector(':scope > ' + selector) || kbCurrent.querySelector(selector);
        if (el) { el.click(); return true; }
        return false;
    }

    function kbOpen(newTab) {
        if (!kbCurrent) return;
        const a = kbCurrent.querySelector('a.title') || kbCurrent.querySelector(':scope > .entry .buttons a.bylink');
        if (!a || !a.href) return;
        if (newTab) window.open(a.href, '_blank', 'noopener');
        else location.href = a.href;
    }

    function toggleHelp() {
        if (helpBox) { helpBox.remove(); helpBox = null; return; }
        helpBox = document.createElement('div');
        helpBox.className = 'cb-help';
        helpBox.setAttribute('role', 'dialog');
        helpBox.setAttribute('aria-label', 'Keyboard shortcuts');
        const rows = [['j / k', 'next / previous post or comment'], ['o or Enter', 'open the link'], ['Shift + O', 'open the link in a new tab'],
            ['c', 'open the comments'], ['x', 'expand media, or fold a comment'], ['a / z', 'upvote / downvote'],
            ['s', 'save'], ['Esc', 'clear the selection'], ['?', 'show or hide this list']];
        const h = document.createElement('h2');
        h.textContent = 'Keyboard shortcuts';
        const dl = document.createElement('dl');
        for (const [k, v] of rows) {
            const dt = document.createElement('dt'); dt.textContent = k;
            const dd = document.createElement('dd'); dd.textContent = v;
            dl.append(dt, dd);
        }
        const panel = document.createElement('div');
        panel.className = 'cb-help-panel';
        panel.append(h, dl);
        helpBox.append(panel);
        helpBox.addEventListener('click', toggleHelp);
        document.body.appendChild(helpBox);
    }

    function onKey(e) {
        if (!settings.keyboardNav || resRunning()) return;
        if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
        const t = e.target;
        if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
        const k = e.key;
        if (k === 'Enter' && t && t.closest && t.closest('a, button')) return;   // let focused links and buttons work
        let handled = true;
        if (k === 'j') kbMove(1);
        else if (k === 'k') kbMove(-1);
        else if (k === 'o' || k === 'Enter') { if (!kbCurrent) handled = false; else kbOpen(false); }
        else if (k === 'O') kbOpen(true);
        else if (k === 'c') { const a = kbCurrent && kbCurrent.querySelector('a.comments, :scope > .entry .buttons a.bylink'); if (a) location.href = a.href; else handled = false; }
        else if (k === 'x') handled = kbCurrent && kbCurrent.classList.contains('comment') ? kbClick('.entry .tagline a.expand') : kbClick('.entry .expando-button');
        else if (k === 'a') handled = kbClick('.midcol .arrow.up, .midcol .arrow.upmod');
        else if (k === 'z') handled = kbClick('.midcol .arrow.down, .midcol .arrow.downmod');
        else if (k === 's') handled = kbClick('.entry .buttons .save-button a, .entry .buttons .link-save-button a');
        else if (k === 'Escape') { if (helpBox) toggleHelp(); else if (kbCurrent) kbSelect(null); else handled = false; }
        else if (k === '?') toggleHelp();
        else handled = false;
        if (handled) e.preventDefault();
    }

    /* ---------------------------------------------------------------- */
    /* Infinite scroll on listings                                         */
    /* ---------------------------------------------------------------- */

    let scrollObserver = null;
    let loadingPage = false;
    let pageNo = 1;
    const pageFetch = (typeof content !== 'undefined' && content && typeof content.fetch === 'function')
        ? content.fetch.bind(content) : window.fetch.bind(window);

    function setupInfiniteScroll() {
        const nav = document.querySelector('#siteTable .nav-buttons, .content .nav-buttons');
        const want = settings.infiniteScroll && isListing() && !resRunning() && !document.querySelector('.NERPageMarker');
        if (!want || !nav) {
            if (scrollObserver) { scrollObserver.disconnect(); scrollObserver = null; }
            return;
        }
        if (!scrollObserver) {
            scrollObserver = new IntersectionObserver(entries => {
                if (entries.some(en => en.isIntersecting)) loadNextPage();
            }, { rootMargin: '0px 0px 800px 0px' });
        }
        scrollObserver.disconnect();
        scrollObserver.observe(nav);
    }

    async function loadNextPage() {
        if (loadingPage) return;
        const table = document.getElementById('siteTable');
        const nav = table && table.querySelector('.nav-buttons');
        const next = nav && nav.querySelector('.next-button a');
        if (!next) return;
        loadingPage = true;
        nav.classList.add('cb-loading');
        try {
            const res = await pageFetch(next.href, { credentials: 'include' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            const incoming = doc.getElementById('siteTable');
            if (!incoming) throw new Error('no listing');
            const seen = new Set([...table.querySelectorAll(':scope > .thing')].map(t => t.dataset.fullname));
            pageNo++;
            const marker = document.createElement('div');
            marker.className = 'cb-page-marker';
            marker.textContent = 'Page ' + pageNo;
            table.insertBefore(marker, nav);
            for (const node of [...incoming.children]) {
                if (node.classList.contains('nav-buttons')) continue;
                if (node.classList.contains('thing') && seen.has(node.dataset.fullname)) continue;
                table.insertBefore(document.importNode(node, true), nav);
            }
            const newNav = incoming.querySelector('.nav-buttons');
            if (newNav) nav.replaceWith(document.importNode(newNav, true)); else nav.remove();
            refreshFeatures();
        } catch (err) {
            nav.classList.remove('cb-loading');
            nav.dataset.cbError = 'Could not load the next page (' + err.message + '). Use the link instead.';
        } finally {
            loadingPage = false;
        }
    }

    /* ---------------------------------------------------------------- */
    /* Wiring                                                             */
    /* ---------------------------------------------------------------- */

    function refreshFeatures() {
        if (!isOldReddit()) return;
        headerTools();
        if (settings.newComments) markNewComments(); else clearNewComments();
        commentNav();
        cleanLinks();
        applyFilters();
        absoluteTimes();
        collapseAutomod();
        setupInfiniteScroll();
    }

    let pending = false;
    const observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            if (!document.querySelector('.cb-tools') && settings.headerTools) headerTools();
            markNewComments();
            cleanLinks();
            applyFilters();
            if (settings.absoluteTime) absoluteTimes();
            collapseAutomod();
            if (isCommentsPage() && !nav && settings.commentNav) commentNav();
        });
    });

    function start() {
        if (started || !isOldReddit()) return;
        started = true;
        const user = document.querySelector('#header-bottom-right .user > a');
        me = user ? user.textContent.trim() : '';
        document.addEventListener('click', onLineClick, true);
        document.addEventListener('keydown', onKey);
        observer.observe(document.body, { childList: true, subtree: true });
        refreshFeatures();
        if (isCommentsPage()) loadVisit().then(markNewComments);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
