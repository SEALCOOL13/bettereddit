/* Shared by content.js, background.js and popup.js. */
'use strict';

var CB_DEFAULTS = Object.freeze({
    // look
    theme: 'dark',            // dark | light | auto (classes cb-theme-*)
    accent: '',               // '' = the theme's own accent
    link: '',                 // '' = the theme's own link color
    font: 'inter',            // inter | system | verdana | custom
    fontCustom: '',           // any installed font, by name
    monoCustom: '',           // optional font for code
    textSize: 14,             // post and comment text, px
    lineHeight: 1.55,
    density: 'comfortable',   // comfortable | compact

    // style switches that are on unless turned off
    customScrollbar: true,
    fullWidthText: true,
    hideAds: true,
    hideUpsells: true,
    highlightOP: true,
    highlightMods: true,
    largeMedia: true,
    bigCollapse: true,

    // style switches that are off unless turned on
    hideAwards: false,
    threadLines: false,
    blurNsfw: false,
    dimVisited: false,
    stickyHeader: false,
    hideSrBar: false,
    showOnline: false,
    hideSideOnComments: false,

    // flair and header
    flairStyle: 'edge',       // edge | full | hide
    accountIcons: true,

    // filters: one entry per line (or comma separated)
    filterSubs: '',
    filterDomains: '',
    filterWords: '',
    filterUsers: '',
    filterComments: true,     // also fold comments by filtered users

    // features
    keyboardNav: true,        // switches itself off when RES is running
    absoluteTime: false,
    collapseAutomod: true,
    infiniteScroll: false,    // also off when RES's never-ending reddit runs
    expandAllButton: true,
    redirectOld: true,
    newComments: true,
    commentNav: true,
    lineCollapse: true,
    cleanLinks: true,
    headerTools: true,
    hideSidebar: false
});

/* Style switches: the CSS keys them on html classes. */
var CB_ON_BY_DEFAULT = ['customScrollbar', 'fullWidthText', 'hideAds', 'hideUpsells',
    'highlightOP', 'highlightMods', 'largeMedia', 'bigCollapse', 'accountIcons'];
var CB_OFF_BY_DEFAULT = ['hideAwards', 'threadLines', 'blurNsfw', 'dimVisited',
    'stickyHeader', 'hideSrBar', 'showOnline', 'hideSideOnComments'];

var cbApi = globalThis.browser || globalThis.chrome;
var cbHasPromises = !!globalThis.browser;

/* storage get/set that work with Firefox's promise API and Chrome's callbacks */
function cbStorageGet(area, keys) {
    return new Promise(resolve => {
        try {
            if (cbHasPromises) cbApi.storage[area].get(keys).then(resolve, () => resolve({}));
            else cbApi.storage[area].get(keys, data => resolve(data || {}));
        } catch (e) {
            resolve({});
        }
    });
}

function cbStorageSet(area, data) {
    try {
        const p = cbApi.storage[area].set(data);
        if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* storage unavailable */ }
}

function cbLoadSettings() {
    return cbStorageGet('sync', null).then(stored => Object.assign({}, CB_DEFAULTS, stored));
}

function cbSaveSettings(patch) {
    cbStorageSet('sync', patch);
}

/* Turn "Fira Sans, Noto Sans" into a safe font-family list of quoted names. */
function cbFontList(value) {
    return String(value || '')
        .split(',')
        .map(name => name.replace(/["'\\;{}()<>]/g, '').trim())
        .filter(Boolean)
        .slice(0, 4)
        .map(name => '"' + name + '"')
        .join(', ');
}
