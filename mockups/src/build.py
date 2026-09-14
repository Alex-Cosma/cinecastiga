"""Bundle the reviewable sources into a single offline HTML prototype."""
from pathlib import Path

root = Path(__file__).resolve().parent
styles = '\n'.join((root / name).read_text() for name in ['fonts.css', 'styles.css', 'investigations.css'])
scripts = '\n'.join((root / name).read_text() for name in ['data.js', 'map.js', 'investigations.js', 'app.js'])
template = (root / 'template.html').read_text()
output = template.replace('/* STYLES */', styles).replace('/* SCRIPTS */', scripts.replace('</script', '<\\/script'))
dest = root.parent / 'cinecastiga-v1.html'
dest.write_text(output)
print(f'Built {dest.name} ({len(output.encode()):,} bytes). No network or build step needed to open it.')
