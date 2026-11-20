/* Settings popup: every change saves at once; open reddit tabs update live. */
'use strict';

const form = document.getElementById('settings');
const savedNote = document.getElementById('saved');
const THEME_DEFAULTS = { dark: { accent: '#ff4500', link: '#4b9fe1' }, light: { accent: '#d93a00', link: '#1f6fb2' } };
let current = Object.assign({}, CB_DEFAULTS);
let noteTimer = 0;

function themeDefault(key) {
    const t = current.theme === 'light' ? 'light' : 'dark';
    return THEME_DEFAULTS[t][key];
}

function render() {
    for (const el of form.elements) {
        if (!el.name || !(el.name in CB_DEFAULTS)) continue;
        const v = current[el.name];
        if (el.type === 'checkbox') el.checked = !!v;
        else if (el.type === 'radio') el.checked = el.value === v;
        else if (el.type === 'color') el.value = v || themeDefault(el.name);
        else el.value = v;
    }
    document.getElementById('textSizeOut').textContent = current.textSize + 'px';
    document.getElementById('lineHeightOut').textContent = Number(current.lineHeight).toFixed(2);
    document.getElementById('fontCustomRow').hidden = current.font !== 'custom';
    for (const b of form.querySelectorAll('[data-reset]')) b.disabled = !current[b.dataset.reset];

    // preview the chosen fonts
    const preview = document.getElementById('preview');
    const stacks = {
        inter: 'Inter, "Segoe UI", system-ui, sans-serif',
        system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        verdana: 'Verdana, Geneva, sans-serif',
        custom: (cbFontList(current.fontCustom) || 'inherit') + ', system-ui, sans-serif'
    };
    preview.style.fontFamily = stacks[current.font] || stacks.inter;
    preview.style.fontSize = current.textSize + 'px';
    preview.style.lineHeight = String(current.lineHeight);
    preview.querySelector('code').style.fontFamily = (cbFontList(current.monoCustom) || '"JetBrains Mono"') + ', ui-monospace, monospace';
}

function note(text) {
    savedNote.textContent = text;
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { savedNote.textContent = ''; }, 1600);
}

function save(patch) {
    Object.assign(current, patch);
    cbSaveSettings(patch);
    render();
    note('Saved');
}

form.addEventListener('input', e => {
    const el = e.target;
    if (!el.name || !(el.name in CB_DEFAULTS)) return;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'range') value = Number(el.value);
    else value = el.value;
    if (el.type === 'color' && value.toLowerCase() === themeDefault(el.name)) value = '';
    if (el.type === 'text' || el.tagName === 'TEXTAREA') {
        // wait for the user to stop typing a font name
        clearTimeout(el._t);
        el._t = setTimeout(() => save({ [el.name]: value.trim() }), el.tagName === 'TEXTAREA' ? 700 : 400);
        Object.assign(current, { [el.name]: value });
        return;
    }
    save({ [el.name]: value });
});

form.addEventListener('click', e => {
    const b = e.target.closest('[data-reset]');
    if (b) save({ [b.dataset.reset]: '' });
});

document.getElementById('reset').addEventListener('click', () => {
    current = Object.assign({}, CB_DEFAULTS);
    try { cbApi.storage.sync.clear(); } catch (e) { /* ignore */ }
    cbSaveSettings(Object.assign({}, CB_DEFAULTS));
    render();
    note('Back to defaults');
});

// the popup follows the chosen theme too
function popupTheme() {
    const t = current.theme === 'auto'
        ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
        : current.theme;
    document.documentElement.dataset.theme = t;
    const r = document.documentElement.style;
    if (/^#[0-9a-f]{6}$/i.test(current.accent)) r.setProperty('--accent', current.accent);
    else r.removeProperty('--accent');
}

cbLoadSettings().then(s => {
    current = s;
    render();
    popupTheme();
});

form.addEventListener('change', popupTheme);
form.addEventListener('click', e => { if (e.target.closest('[data-reset], #reset')) popupTheme(); });
