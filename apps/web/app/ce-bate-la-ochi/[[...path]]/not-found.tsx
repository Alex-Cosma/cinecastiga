import Link from 'next/link';
import '../stories.css';
export default function StoryNotFound(){return <section className="stories-page empty-state"><h1>Nu am găsit această pagină.</h1><p>Povestea sau sursa nu este publicată la această adresă.</p><Link className="button" href="/ce-bate-la-ochi">Înapoi la harta poveștilor</Link></section>;}
