"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import styles from "./loading.module.css";

export default function DomainsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  return <section className={styles.shell}>
    <p className={styles.eyebrow}>EXPLOREAZĂ / DOMENII</p>
    <h1 className={styles.title}>Harta nu s-a putut încărca.</h1>
    <p className={styles.message} role="alert">Datele nu sunt disponibile momentan. Poți încerca din nou sau poți explora înregistrările printr-o întrebare.</p>
    <div className={styles.actions}>
      <button type="button" onClick={() => startTransition(() => { router.refresh(); reset(); })}>Încearcă din nou</button>
      <Link href="/domenii">Deschide anul implicit</Link>
      <Link href="/intreaba">Construiește o întrebare →</Link>
    </div>
  </section>;
}
