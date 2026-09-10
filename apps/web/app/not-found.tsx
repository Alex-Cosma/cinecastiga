import Link from "next/link";

export default function NotFound() {
  return (
    <div className="err-page">
      <p className="eyebrow">404</p>
      <h1 className="page-title">Nu există această pagină</h1>
      <p className="page-sub">
        Entitatea, contractul sau anunțul căutat nu este în datele noastre, sau adresa e greșită.
      </p>
      <div className="err-acts">
        <Link href="/" className="btn pri">
          Caută o entitate
        </Link>
        <Link href="/semnale" className="btn">
          Semnale de risc
        </Link>
      </div>
    </div>
  );
}
