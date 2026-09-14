import styles from "./loading.module.css";

export default function DomainsLoading() {
  return <section className={styles.shell} aria-busy="true" aria-label="Se încarcă domeniile de achiziții">
    <p className={styles.eyebrow}>EXPLOREAZĂ / DOMENII</p>
    <h1 className={styles.title}>Ce cumpără<br /><span>instituțiile publice?</span></h1>
    <p className={styles.message} role="status">Pregătim harta domeniilor și valorile din înregistrările publice.</p>
    <div className={styles.toolbar} aria-hidden="true" />
    <div className={styles.canvas} aria-hidden="true"><span /><span /><span /></div>
  </section>;
}
