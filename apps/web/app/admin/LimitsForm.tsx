'use client';
import type {CollectionStatus} from '@/lib/admin/collection';
import {fmt} from './model';

export interface Pace {min: string; max: string; daily: boolean; limit: string; revision: number}
export const paceOf = (c: Record<string, any>): Pace => ({min: String(c.min_seconds), max: String(c.max_seconds), daily: c.daily_limit !== null, limit: String(c.daily_limit ?? 1000), revision: c.revision});

/**
 * The collection's limits (owner, 7 November 2026: every pace setting on Conexiune): the pause between requests in
 * direct mode and the daily cap. They apply at once, collecting or not; the proxy route above needs a pause.
 */
export default function LimitsForm({data, form, setForm, dirty, stale, saving, reset, submit}: {
  data: CollectionStatus; form: Pace; setForm: (next: Pace) => void; dirty: boolean; stale: boolean; saving: boolean;
  reset: () => void; submit: () => Promise<boolean>;
}) {
  const c = data.control!, direct = !data.proxies.settings.enabled, maintenance = !!c.maintenance;
  const min = Number(form.min), max = Number(form.max), limit = Number(form.limit);
  const valid = Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max <= 3600 && min <= max && (!form.daily || Number.isSafeInteger(limit) && limit >= 1);
  const conflict = dirty && form.revision !== c.revision;
  const edit = (patch: Partial<Pace>) => setForm({...form, ...patch});
  const changes = [
    (min !== c.min_seconds || max !== c.max_seconds) && `interval direct ${c.min_seconds}–${c.max_seconds} → ${form.min}–${form.max} s`,
    (form.daily !== (c.daily_limit !== null) || form.daily && limit !== c.daily_limit) && `limită zilnică ${c.daily_limit === null ? 'fără' : fmt(c.daily_limit)} → ${form.daily ? fmt(form.limit) : 'fără'}`,
  ].filter(Boolean);
  return <section className="limits" aria-labelledby="limits-title">
    <div className="section-heading"><h2 id="limits-title">Limite</h2><span className="subtle">se aplică imediat</span></div>
    <form onSubmit={e => { e.preventDefault(); if (valid && !conflict) void submit(); }}>
      <fieldset disabled={maintenance || stale}>
        {direct ? <div className="limit-row">
          <div className="limit-label"><strong>Pauză între cereri</strong><small>Modul direct · un număr aleator în interval</small></div>
          <div className="limit-control">
            <div className="delay-fields">
              <label>Minimum<span className="unit-input"><input id="delay-min" type="number" min="1" max="3600" step="1" required value={form.min} onChange={e => edit({min: e.target.value})}/><span>s</span></span></label>
              <span className="range-dash" aria-hidden="true">–</span>
              <label>Maximum<span className="unit-input"><input id="delay-max" type="number" min="1" max="3600" step="1" required value={form.max} onChange={e => edit({max: e.target.value})}/><span>s</span></span></label>
            </div>
            <div className="presets" role="group" aria-label="Intervale uzuale">
              {[[50, 70], [90, 120], [120, 180]].map(([a, b]) => <button key={a} type="button" className="preset" aria-pressed={min === a && max === b} onClick={() => edit({min: String(a), max: String(b)})}>{a}–{b} s</button>)}
            </div>
            <p className="rate-estimate">{valid ? `≈ ${fmt(Math.round(7200 / (min + max)))} cereri pe oră` : 'Interval nevalid: minimum 1, maximum 3600, minimul cel mult cât maximul.'}</p>
          </div>
        </div> : <p className="limit-note">Prin proxy-uri, pauza se alege pe fiecare IP, în setările de mai sus.</p>}
        <div className="limit-row">
          <div className="limit-label"><label htmlFor="daily-enabled"><strong>Limită zilnică</strong></label><small>Include încercările eșuate. Se resetează la 00:00.</small></div>
          <div className="limit-control limit-inline">
            <input className="switch" role="switch" id="daily-enabled" type="checkbox" checked={form.daily} onChange={e => edit({daily: e.target.checked})}/>
            {form.daily && <label className="unit-input compact"><span className="sr-only">Maximum de încercări pe zi</span><input id="daily-limit" type="number" min="1" max="10000000" step="1" required value={form.limit} onChange={e => edit({limit: e.target.value})}/><span>pe zi</span></label>}
          </div>
        </div>
      </fieldset>
      {dirty && changes.length > 0 && <p className="settings-diff">Se schimbă: {changes.join('; ')}.</p>}
      {conflict && <p className="form-error" role="alert">Alt administrator a modificat setările. Reîncarcă valorile înainte de aplicare.</p>}
      {maintenance && <p className="hint">Limitele se pot schimba după mentenanță.</p>}
      <div className="form-actions">
        <button className="button primary" disabled={!dirty || !valid || conflict || saving || stale || maintenance}>{saving ? 'Se salvează…' : 'Aplică limitele'}</button>
        {(dirty || conflict) && <button type="button" className="text-button" onClick={reset}>Renunță</button>}
      </div>
    </form>
  </section>;
}
