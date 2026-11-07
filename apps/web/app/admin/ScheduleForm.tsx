'use client';
import type {CollectionStatus} from '@/lib/admin/collection';
import {WEEKDAYS} from './model';

export interface Schedule {at: string; enabled: boolean; riskDay: number; revision: number}
export const scheduleOf = (c: Record<string, any>): Schedule => ({at: c.processing_time, enabled: !!c.processing_enabled, riskDay: c.risk_weekday ?? 0, revision: c.revision});

/** The nightly processing's schedule, saved on its own (owner, 7 November 2026: one form per page). */
export default function ScheduleForm({data, form, setForm, dirty, stale, saving, reset, submit}: {
  data: CollectionStatus; form: Schedule; setForm: (next: Schedule) => void; dirty: boolean; stale: boolean; saving: boolean;
  reset: () => void; submit: () => Promise<boolean>;
}) {
  const c = data.control!, maintenance = !!c.maintenance;
  const valid = /^([01]\d|2[0-3]):[0-5]\d$/.test(form.at);
  const conflict = dirty && form.revision !== c.revision;
  const edit = (patch: Partial<Schedule>) => setForm({...form, ...patch});
  const changes = [
    form.enabled !== c.processing_enabled && (form.enabled ? 'program pornit' : 'program oprit'),
    form.at !== c.processing_time && `ora ${String(c.processing_time).slice(0, 5)} → ${form.at.slice(0, 5)}`,
    form.riskDay !== c.risk_weekday && `riscul ${WEEKDAYS[c.risk_weekday ?? 0]!.toLowerCase()} → ${WEEKDAYS[form.riskDay]!.toLowerCase()}`,
  ].filter(Boolean);
  return <aside className="settings" aria-labelledby="schedule-title">
    <h2 id="schedule-title">Program</h2>
    <form onSubmit={e => { e.preventDefault(); if (valid && !conflict) void submit(); }}>
      <fieldset disabled={maintenance || stale}>
        <legend className="sr-only">Programul procesării</legend>
        <div className="setting-row"><label htmlFor="processing-enabled">Procesare automată<small>Backup și mentenanță înainte de fiecare rulare.</small></label><input className="switch" role="switch" id="processing-enabled" type="checkbox" checked={form.enabled} onChange={e => edit({enabled: e.target.checked})}/></div>
        <div className="setting-row"><label htmlFor="maintenance-time">Ora zilnică<small>Ora României.</small></label><input id="maintenance-time" type="time" required value={form.at} onChange={e => edit({at: e.target.value})}/></div>
        <div className="setting-row"><label htmlFor="risk-weekday">Recalcularea riscului<small>O dată pe săptămână, la aceeași oră.</small></label><select id="risk-weekday" value={form.riskDay} onChange={e => edit({riskDay: Number(e.target.value)})}>{WEEKDAYS.map((day, i) => <option key={i} value={i}>{day}</option>)}</select></div>
      </fieldset>
      {dirty && changes.length > 0 && <p className="settings-diff">Se schimbă: {changes.join('; ')}.</p>}
      {conflict && <p className="form-error" role="alert">Alt administrator a modificat setările. Reîncarcă valorile înainte de aplicare.</p>}
      {dirty && !valid && <p className="form-error" role="alert">Alege o oră validă.</p>}
      <button className="button primary apply" disabled={!dirty || !valid || conflict || saving || stale || maintenance}>{saving ? 'Se salvează…' : dirty ? 'Aplică programul' : 'Programul e la zi'}</button>
      {(dirty || conflict) && <button type="button" className="text-button discard" onClick={reset}>Renunță</button>}
      <p className="save-hint">{maintenance ? 'Programul se poate schimba după mentenanță. ' : ''}Pornirea contează de la următoarea oră programată; oprirea nu întrerupe o rulare începută.</p>
    </form>
  </aside>;
}
