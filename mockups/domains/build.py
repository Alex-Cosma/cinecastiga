"""Build the two design directions into one portable, offline HTML file."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent
styles = (root.parent / 'src/fonts.css').read_text() + '\n' + (root / 'styles.css').read_text()
scripts = '\n'.join((root / name).read_text() for name in ('data.js', 'atlas.js', 'app.js'))
scripts = re.sub(r'^import .*?;\s*$', '', scripts, flags=re.M)
scripts = re.sub(r'\bexport (?=(?:const|function|let|class)\b)', '', scripts)
scripts = scripts.replace('</script', '<\\/script')
html = (root / 'template.html').read_text().replace('/* STYLES */', styles).replace('/* SCRIPTS */', scripts)
out = root.parent / 'cinecastiga-domains.html'
out.write_text(html)
print(f'Built {out.name}: {out.stat().st_size:,} bytes')
