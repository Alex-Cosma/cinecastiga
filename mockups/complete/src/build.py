"""Build the complete, offline question and evidence prototype.

The original v1 and proposal A files remain untouched. Checked adapters run on
in-memory copies; an upstream anchor change fails the build explicitly. Run
this module only after all complete prototype sources are ready.
"""

from hashlib import sha256
import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent
MOCKUPS = ROOT.parents[1]
ORIGINAL = MOCKUPS / "src"
QUESTION = MOCKUPS / "question" / "src"
OUTPUT = MOCKUPS / "cinecastiga-complete.html"

_spec = importlib.util.spec_from_file_location("question_mockup_builder", QUESTION / "build.py")
if _spec is None or _spec.loader is None:
    raise RuntimeError("Cannot load the checked proposal A build adapters")
_question_builder = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_question_builder)
replace_once = _question_builder.replace_once


def adapt_app(source: str) -> str:
    source = _question_builder.adapt_app(source)
    return replace_once(
        source,
        "  document.addEventListener('keydown',e=>{",
        "  document.addEventListener('keydown',e=>{\n"
        "    if(document.querySelector('#q-picker[open], #q-evidence-drawer[open]'))return;",
        "focused question and evidence dialogs own keyboard shortcuts",
    )


def adapt_investigations(source: str) -> str:
    source = _question_builder.adapt_investigations(source)
    edits = [
        (
            "complete prototype uses its own investigation storage",
            "const KEY = 'cinecastiga-prototype-investigations-v1';",
            "const KEY = 'cinecastiga-complete-investigations-v1';",
        ),
        (
            "saved complete questions render their immutable evidence references",
            "  function renderEvidence(item) {",
            "  function renderEvidence(item) {\n"
            "    if(item.type==='query' && item.snapshot?.sourceHash)return window.Complete.renderSaved(item);",
        ),
        (
            "portable dossier exports contain the complete underlying records",
            "dossier: d };",
            "dossier: window.Complete.expandDossier(d) };",
        ),
    ]
    for label, old, new in edits:
        source = replace_once(source, old, new, label)
    return source


def adapt_template(source: str) -> str:
    source = _question_builder.adapt_template(source)
    edits = [
        (
            "complete prototype footer",
            "Propunerea A · Întrebarea editabilă · Schiță interactivă",
            "13 întrebări · Fiecare rezultat, până la sursă",
        ),
        (
            "recorded-value source footer",
            "Surse publice SICAP · Valori contractate, nu plăți efectuate.",
            "Surse publice SEAP · Valori înregistrate, nu plăți efectuate.",
        ),
    ]
    for label, old, new in edits:
        source = replace_once(source, old, new, label)
    return source


def build() -> None:
    style_files = [
        ORIGINAL / "fonts.css",
        ORIGINAL / "styles.css",
        ORIGINAL / "investigations.css",
        QUESTION / "question.css",
        ROOT / "answers.css",
        ROOT / "evidence.css",
        ROOT / "complete.css",
    ]
    module_files = [ROOT / name for name in ["engine.js", "answers.js", "evidence.js", "complete.js"]]
    data_files = [ORIGINAL / "data.js", ORIGINAL / "map.js", ROOT / "profile-data.js"]
    required = style_files + data_files + module_files + [ORIGINAL / name for name in ["app.js", "investigations.js", "template.html"]]
    missing = [str(path.relative_to(MOCKUPS)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("Complete prototype sources are not ready: " + ", ".join(missing))

    def read(path: Path) -> str:
        return path.read_text(encoding="utf-8")

    original_data = read(ORIGINAL / "data.js")
    profile_data = read(ROOT / "profile-data.js")
    # The separator makes the two distinct source boundaries unambiguous.
    source_hash = sha256(original_data.encode("utf-8") + b"\0" + profile_data.encode("utf-8")).hexdigest()
    source_identity = "window.COMPLETE_SOURCE_HASH = " + json.dumps(source_hash) + ";"
    scripts = "\n".join([
        original_data,
        read(ORIGINAL / "map.js"),
        profile_data,
        source_identity,
        *(read(path) for path in module_files),
        adapt_investigations(read(ORIGINAL / "investigations.js")),
        adapt_app(read(ORIGINAL / "app.js")),
    ])
    styles = "\n".join(read(path) for path in style_files)
    template = adapt_template(read(ORIGINAL / "template.html"))
    output = replace_once(template, "/* STYLES */", styles, "embedded complete styles")
    output = replace_once(output, "/* SCRIPTS */", scripts.replace("</script", "<\\/script"), "embedded complete scripts")
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"Built {OUTPUT.name} ({len(output.encode('utf-8')):,} bytes). Source snapshot {source_hash[:12]}. Original prototypes unchanged.")


if __name__ == "__main__":
    build()
