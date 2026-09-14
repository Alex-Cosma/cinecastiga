"""Bundle proposal A while preserving every original v1 source and artifact.

Run only once question.js, question.css, and company-data.js are ready. The
checked adapters below modify copies in memory; a changed upstream anchor makes
the build fail explicitly rather than silently dropping an integration.
"""

from pathlib import Path


ROOT = Path(__file__).resolve().parent
MOCKUPS = ROOT.parents[1]
ORIGINAL = MOCKUPS / "src"
OUTPUT = MOCKUPS / "cinecastiga-question.html"


def replace_once(source: str, old: str, new: str, label: str) -> str:
    count = source.count(old)
    if count != 1:
        raise ValueError(f"{label}: expected exactly one original anchor, found {count}")
    return source.replace(old, new, 1)


def adapt_app(source: str) -> str:
    edits = [
        (
            "question route and default",
            "return {view:['home','explore','entity','investigations'].includes(v) ? v : 'home', params:Object.fromEntries(new URLSearchParams(p || ''))};",
            "return {view:['home','explore','entity','investigations','question'].includes(v) ? v : 'question', params:Object.fromEntries(new URLSearchParams(p || ''))};",
        ),
        (
            "initial question state",
            "let state = { view:'home', params:{} };",
            "let state = { view:'question', params:{} };",
        ),
        (
            "record drawer API",
            "window.UI = {escape:esc,icon,toast,modal,closeModal,navigate,rerender:()=>render(false)};",
            "window.UI = {escape:esc,icon,toast,modal,closeModal,navigate,rerender:()=>render(false),openRecord:recordDetail};",
        ),
        (
            "question action delegation",
            "function onAction(action,el) {",
            "function onAction(action,el) {\n    if(action.startsWith('q-')){window.Question.handleAction(action,el);return;}",
        ),
        (
            "question active navigation",
            "el.dataset.nav===state.view||(state.view==='entity'&&el.dataset.nav==='explore')",
            "el.dataset.nav===state.view||(['entity','question'].includes(state.view)&&el.dataset.nav==='explore')",
        ),
        (
            "question renderer",
            "$('#view').innerHTML=state.view==='home'?home():state.view==='explore'?explore():state.view==='entity'?entity():window.Investigations.render();",
            "if(state.view!=='question')window.Question.leave();\n    $('#view').innerHTML=state.view==='question'?window.Question.render(state.params):state.view==='home'?home():state.view==='explore'?explore():state.view==='entity'?entity():window.Investigations.render();",
        ),
        (
            "question page title",
            "document.title=(state.view==='home'?'Sunt banii tăi.':state.view==='investigations'?'Anchetele tale':state.view==='entity'?'Urmărește o instituție sau o firmă':'Explorează achizițiile')+' — cinecâștigă?';",
            "document.title=(state.view==='question'?'Construiește o întrebare':state.view==='home'?'Sunt banii tăi.':state.view==='investigations'?'Anchetele tale':state.view==='entity'?'Urmărește o instituție sau o firmă':'Explorează achizițiile')+' — cinecâștigă?';",
        ),
        (
            "question entry from Explore",
            '<span class="sample-tag">48 de înregistrări reale</span></div>\'+filters()',
            '<div class="heading-actions"><a class="button secondary" href="#question">Construiește o întrebare \'+icon(\'arrow\')+\'</a><span class="sample-tag">48 de înregistrări reale</span></div></div>\'+filters()',
        ),
        (
            "question entry from home",
            '<p class="hero-reassurance">\'+icon(\'shield\')+\'Gratuit. Date publice. Curiozitatea e suficientă.</p>',
            '<p class="hero-reassurance">\'+icon(\'shield\')+\'Gratuit. Date publice. Curiozitatea e suficientă.</p><a class="text-button" style="margin-top:16px;font-size:12px" href="#question">Construiește o întrebare \'+icon(\'arrow\')+\'</a>',
        ),
    ]
    for label, old, new in edits:
        source = replace_once(source, old, new, label)
    return source


def adapt_investigations(source: str) -> str:
    edits = [
        (
            "saved queries include aggregate source records",
            "const isEntity = ['entity', 'authority', 'supplier'].includes(item.type);",
            "const isEntity = ['entity', 'authority', 'supplier', 'query'].includes(item.type);",
        ),
        (
            "saved query label",
            "const kind = isEntity ? 'Instituție / firmă' : item.type === 'da' ? 'Achiziție directă' : 'Contract';",
            "const kind = item.type === 'query' ? 'Întrebare salvată' : isEntity ? 'Instituție / firmă' : item.type === 'da' ? 'Achiziție directă' : 'Contract';",
        ),
        (
            "safe local question reference",
            "const amount = formatAmount(item.snapshot.amount);",
            "const amount = formatAmount(item.snapshot.amount);\n    const savedQueryUrl = typeof item.snapshot.queryUrl === 'string' && /^#question(?:\\?[^\\r\\n]*)?$/.test(item.snapshot.queryUrl) ? item.snapshot.queryUrl : '';\n    const reopenQuestion = item.type === 'query' && savedQueryUrl ? '<p style=\"margin-top:14px\"><a class=\"text-button\" href=\"' + esc(savedQueryUrl) + '\">Redeschide întrebarea ' + icon('arrow') + '</a></p>' : '';",
        ),
        (
            "show saved question reopening action",
            "+ entitySources + '</div></article>';",
            "+ entitySources + reopenQuestion + '</div></article>';",
        ),
    ]
    for label, old, new in edits:
        source = replace_once(source, old, new, label)
    return source


def adapt_template(source: str) -> str:
    edits = [
        (
            "question navigation entry",
            '<a href="#explore" data-nav="explore">Explorează</a>',
            '<a href="#question" data-nav="explore">Explorează</a>',
        ),
        (
            "proposal footer",
            "Prototip v1 · Descoperire, dovezi, anchete",
            "Propunerea A · Întrebarea editabilă · Schiță interactivă",
        ),
        (
            "initial document title",
            "<title>cinecâștigă? — Sunt banii tăi.</title>",
            "<title>Construiește o întrebare — cinecâștigă?</title>",
        ),
        (
            "question metadata description",
            "Sunt banii tăi. Vezi unde ajung. Un prototip interactiv pentru explorarea achizițiilor publice din România.",
            "O întrebare clară. Un răspuns verificabil. Schiță interactivă pentru întrebări despre achizițiile publice din România.",
        ),
    ]
    for label, old, new in edits:
        source = replace_once(source, old, new, label)
    return source


def build() -> None:
    required = [ROOT / name for name in ["question.css", "question.js", "company-data.js"]]
    missing = [str(path.relative_to(MOCKUPS)) for path in required if not path.is_file()]
    if missing:
        raise SystemExit("Question sketch sources are not ready: " + ", ".join(missing))

    def read(path: Path) -> str:
        return path.read_text(encoding="utf-8")

    styles = "\n".join(read(ORIGINAL / name) for name in ["fonts.css", "styles.css", "investigations.css"])
    styles += "\n" + read(ROOT / "question.css")
    scripts = "\n".join([
        read(ORIGINAL / "data.js"),
        read(ORIGINAL / "map.js"),
        adapt_investigations(read(ORIGINAL / "investigations.js")),
        read(ROOT / "company-data.js"),
        read(ROOT / "question.js"),
        adapt_app(read(ORIGINAL / "app.js")),
    ])
    template = adapt_template(read(ORIGINAL / "template.html"))
    output = replace_once(template, "/* STYLES */", styles, "embedded styles")
    output = replace_once(output, "/* SCRIPTS */", scripts.replace("</script", "<\\/script"), "embedded scripts")
    OUTPUT.write_text(output, encoding="utf-8")
    print(f"Built {OUTPUT.name} ({len(output.encode('utf-8')):,} bytes). Original v1 unchanged.")


if __name__ == "__main__":
    build()
