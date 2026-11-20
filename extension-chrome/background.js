/* Chrome build. Sends www.reddit.com page loads to old.reddit.com using
   declarativeNetRequest (Chrome's replacement for blocking webRequest).
   Pages that only exist on the new site are left alone. */
importScripts('settings.js');

const NEW_ONLY_PATH = '(?:media|poll|chat|settings|appeals?|premium|coins|mod|notifications|answers|avatar|svc|reddit-help|community-points)(?:/|\\?|$)';

// rule 1 lets the new-only pages through; rule 2 redirects everything else
const RULES = [
    {
        id: 1,
        priority: 2,
        action: { type: 'allow' },
        condition: {
            regexFilter: '^https?://(?:www\\.|np\\.)?reddit\\.com(?:/' + NEW_ONLY_PATH + '|/r/[^/]+/s/|/u(?:ser)?/[^/]+/s/|[^#]*[?&]carbon-keep-new)',
            resourceTypes: ['main_frame']
        }
    },
    {
        id: 2,
        priority: 1,
        action: { type: 'redirect', redirect: { transform: { scheme: 'https', host: 'old.reddit.com' } } },
        condition: {
            regexFilter: '^https?://(?:www\\.|np\\.)?reddit\\.com/',
            resourceTypes: ['main_frame']
        }
    }
];

function applyRedirect(on) {
    return chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [1, 2],
        addRules: on ? RULES : []
    });
}

cbLoadSettings().then(s => applyRedirect(!!s.redirectOld));

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.redirectOld) {
        applyRedirect(changes.redirectOld.newValue === undefined ? CB_DEFAULTS.redirectOld : !!changes.redirectOld.newValue);
    }
});
