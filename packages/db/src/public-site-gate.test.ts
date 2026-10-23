import { describe, expect, it } from 'vitest';
import { publicSiteOpen, type PublicGateState } from './processing.js';

const run=(stage:string,patch:Record<string,unknown>={})=>({stage,controlRevision:8,maintenanceBefore:false,...patch});
const state=(maintenance:unknown,running:unknown[]=[],revision:unknown=8):PublicGateState=>({maintenance,revision,running});

describe('public site during processing (owner decision, 23 October 2026)',()=>{
 it('is open without maintenance, whatever the processing history',()=>{
  expect(publicSiteOpen(state(false))).toBe(true);
  expect(publicSiteOpen(state(false,[run('normalize')]))).toBe(true);
 });
 it.each(['drain','backup'])('stays open while the claimed run is in %s',stage=>{
  expect(publicSiteOpen(state(true,[run(stage)]))).toBe(true);
 });
 it.each(['backup-verified','reference-repair','currency-repair','authority-uat-repair','normalize','marts','flags','search','restart','reopen','complete','unknown-stage'])
 ('closes from %s on, when data may change',stage=>{
  expect(publicSiteOpen(state(true,[run(stage)]))).toBe(false);
 });
 it('closes for maintenance without a running run: operator maintenance or a failed publication',()=>{
  expect(publicSiteOpen(state(true,[]))).toBe(false);
 });
 it('closes for a run claimed while the site was already closed (recovery, run after a failure)',()=>{
  expect(publicSiteOpen(state(true,[run('drain',{maintenanceBefore:true})]))).toBe(false);
  expect(publicSiteOpen(state(true,[run('backup',{maintenanceBefore:true})]))).toBe(false);
 });
 it('closes for a run claimed before this rule recorded the earlier state',()=>{
  expect(publicSiteOpen(state(true,[run('drain',{maintenanceBefore:null})]))).toBe(false);
  expect(publicSiteOpen(state(true,[{stage:'drain',controlRevision:8}]))).toBe(false);
 });
 it('closes after any control change since the claim',()=>{
  expect(publicSiteOpen(state(true,[run('backup')],9))).toBe(false);
  expect(publicSiteOpen(state(true,[run('backup',{controlRevision:'8'})]))).toBe(false);
 });
 it('closes for more than one running run',()=>{
  expect(publicSiteOpen(state(true,[run('drain'),run('drain')]))).toBe(false);
 });
 it('closes for a missing or malformed control row',()=>{
  expect(publicSiteOpen(undefined)).toBe(false);
  expect(publicSiteOpen(state(null))).toBe(false);
  expect(publicSiteOpen(state('f'))).toBe(false);
  expect(publicSiteOpen(state(true,null as unknown as unknown[]))).toBe(false);
  expect(publicSiteOpen(state(true,[null]))).toBe(false);
 });
});
