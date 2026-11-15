"""Turn the CarbonForReddit userstyle (Stylus preprocessor) into one runtime CSS for the extension.
Options become classes on <html> (set by content.js) and CSS variables."""
import re, subprocess, sys, pathlib
root = pathlib.Path(__file__).parent
src = (root/'CarbonForReddit.user.css').read_text()
head, body = src.split('==/UserStyle== */', 1)

# options that default ON are switched off with html.cb-off-<name>; default OFF ones on with html.cb-on-<name>
default_on = {'customScrollbar','fullWidthText','hideAds','hideUpsells','highlightOP','highlightMods','largeMedia','bigCollapse'}
default_off = {'hideAwards','threadLines','blurNsfw','dimVisited','stickyHeader','hideSrBar','showOnline','hideSideOnComments'}

# 1. stylus option variables -> CSS variables
pre = '''cAccent = #ff4500
cDown = #9494ff
cLink = #4b9fe1
cTitle = #e4e4e7
cVisited = #8e8e96
mdFontSize = unquote('var(--cb-md-size)')
mdLineHeight = unquote('var(--cb-md-lh)')
fontStyle = '0'
density = 'comfortable'
theme = 'carbon'
customFont = ''
customMono = ''
flairStyle = 'edge'
accountIcons = 1
'''
def mix(var, pct): return f"unquote('color-mix(in srgb, var(--cb-{var}) {round(float(pct)*100)}%, transparent)')"
body = re.sub(r'rgba\(cLink,\s*([\d.]+)\)', lambda m: mix('link', m.group(1)), body)
body = re.sub(r'rgba\(cAccent,\s*([\d.]+)\)', lambda m: mix('accent', m.group(1)), body)
body = re.sub(r'lighten\(c(Title|Visited),\s*\d+%\)', 'var(--cb-text)', body)

# 2. token block: add runtime text size and line height
body = body.replace('        --cb-visited: cVisited;', '        --cb-visited: cVisited;\n        --cb-md-size: 14px;\n        --cb-md-lh: 1.55;', 1)
assert '--cb-md-size: 14px' in body

# 2b. theme + custom fonts: classes instead of compile-time choices
import re as _re
body, n = _re.subn(r'    /\* USERSTYLE-ONLY START \*/.*?/\* USERSTYLE-ONLY END \*/\n', '''    html.cb-theme-light:has(#header-bottom-left) {
        paperTokens();
    }
    @media (prefers-color-scheme: light) {
        html.cb-theme-auto:has(#header-bottom-left) {
            paperTokens();
        }
    }
''', body, flags=_re.S)
assert n == 1, 'userstyle-only block not found'

# 3. font + density selects
body = re.sub(r"    if fsel == '2' \{\n        \{R\} \{", "    html.cb-font-verdana {\n        & {", body)
body = re.sub(r"    if fsel == '3' \{\n        \{R\} \{\n.*?\n        \}\n    \}\n", '''    html.cb-font-system {
        & {
            --cb-font: system-ui, -apple-system, "Segoe UI", Roboto, Cantarell, "Noto Sans", sans-serif;
        }
    }
''', body, flags=re.S)
body = body.replace("    if dens == 'compact' {", '    html.cb-compact {')

# 4. checkbox options
body = body.replace('    if svgIcons == 1 {', '    html {')   # always on in the extension
def opt(m):
    name = m.group(1)
    if name in default_on: return f'    html:not(.cb-off-{name}) {{'
    if name in default_off: return f'    html.cb-on-{name} {{'
    raise SystemExit('unknown option '+name)
body = re.sub(r'    if (\w+) == 1 \{', opt, body)
# {R} (= :root) cannot nest under html.*; use the parent selector
def fix_root(block_start):
    pass
body = re.sub(r'(html:not\(\.cb-off-customScrollbar\) \{\n)        \{R\} \{', r'\1        & {', body)

# 5. drop the @-moz-document wrapper (extension match patterns scope it)
body = body.replace('@-moz-document domain("reddit.com") {', '/* scoped by the extension\'s match patterns */\n.cb-scope {', 1)
leftover = re.findall(r'^\s*if [^\n]+\{', body, re.M)
if leftover: raise SystemExit('unconverted conditionals: %r' % leftover)
license = '/* CarbonForReddit, (c) /u/ggitaliano (original), Xyl and brian6932 (forks), Abdur-Rahman.\n   GPL-2.0-only. https://github.com/SEALCOOL13/bettereddit */\n'
styl = pre + body
tmp = root/'carbon.ext.styl'
tmp.write_text(styl)
prefix = sys.argv[1] if len(sys.argv) > 1 else str(root)
out = subprocess.run(['npx','--prefix',prefix,'stylus','--print',str(tmp)],capture_output=True,text=True)
tmp.unlink()
if out.returncode: print(out.stderr[:3000]); raise SystemExit(1)
css = out.stdout
# unwrap the .cb-scope helper that stood in for @-moz-document
css = css.replace('.cb-scope ', '').replace('.cb-scope{', '{')
themes = ('/* custom fonts set by content.js */\nhtml.cb-font-custom:has(#header-bottom-left) {\n  --cb-font: var(--cb-font-custom), system-ui, sans-serif;\n}\n'
          'html.cb-mono-custom:has(#header-bottom-left) {\n  --cb-mono: var(--cb-mono-custom), ui-monospace, monospace;\n}\n')
(root/'extension/carbon.css').write_text(license + css + themes)
print('ok', len(css))
