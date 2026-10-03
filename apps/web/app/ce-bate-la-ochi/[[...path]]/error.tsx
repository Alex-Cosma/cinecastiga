'use client';
import '../stories.css';
export default function StoriesError({reset}:{reset:()=>void}){return <div className="stories-page empty-state" role="alert"><h1>Poveștile nu pot fi încărcate acum.</h1><p>Datele documentării nu sunt disponibile. Încearcă din nou.</p><button className="button" onClick={reset}>Reîncearcă</button></div>;}
