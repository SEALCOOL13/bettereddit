/* Sends www.reddit.com page loads to old.reddit.com.
   Pages that only exist on the new site are left alone. */
'use strict';

let redirectOn = CB_DEFAULTS.redirectOld;

// paths old reddit cannot show
const NEW_ONLY = /^\/(?:media|poll|chat|settings|appeals?|premium|coins|mod|notifications|answers|avatar|svc|reddit-help|community-points)(?:\/|$|\?)|^\/r\/[^/]+\/s\/|^\/u(?:ser)?\/[^/]+\/s\//i;

function redirect(details) {
    if (!redirectOn) return {};
    let url;
    try { url = new URL(details.url); } catch (e) { return {}; }
    if (NEW_ONLY.test(url.pathname)) return {};
    if (url.searchParams.has('carbon-keep-new')) return {};
    url.hostname = 'old.reddit.com';
    return { redirectUrl: url.href };
}

cbApi.webRequest.onBeforeRequest.addListener(
    redirect,
    { urls: ['*://www.reddit.com/*', '*://reddit.com/*', '*://np.reddit.com/*'], types: ['main_frame'] },
    ['blocking']
);

cbLoadSettings().then(s => { redirectOn = !!s.redirectOld; });

cbApi.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.redirectOld) {
        redirectOn = changes.redirectOld.newValue === undefined ? CB_DEFAULTS.redirectOld : !!changes.redirectOld.newValue;
    }
});
