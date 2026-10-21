import {afterAll,describe,it,expect} from 'vitest';
import {createDb,entities,entitySicapIds,entityRedirects} from '@seap/db';
import {eq} from 'drizzle-orm';
import {resolveEntity} from './resolve-entity.js';
import {reviewedWinnerIdentity} from './reviewed-winner.js';
const url=process.env.TEST_DATABASE_URL;
if(url&&!/^seap_test_[a-z0-9_]+$/.test(new URL(url).pathname.slice(1)))throw Error('Dedicated test database required');
const connection=url?createDb(url):null;
afterAll(async()=>{await connection?.sql.end();});
describe.skipIf(!connection)('SICAP mapping versus exact valid CUI',()=>{
 for(const [name,correct,typo] of [['MEDI SENSE','33240921','3324092'],['Wigstein','27390673','273906673']]){
  it(`resolves ${name} without duplicating CUI or silently merging historical profiles`,async()=>{
   const rollback=new Error('rollback');
   await expect(connection!.db.transaction(async tx=>{
    const [canonical]=await tx.insert(entities).values({nameDisplay:name!,nameNormalized:name!.toLowerCase(),cuiCanonical:correct!,cuiValid:true}).returning();
    const [placeholder]=await tx.insert(entities).values({nameDisplay:name!,nameNormalized:name!.toLowerCase(),cuiValid:false,cuiRawVariants:[typo!]}).returning();
    await tx.insert(entitySicapIds).values({namespace:'winner',sicapId:999991,entityId:placeholder!.id});
    const input={sicapId:999991,namespace:'winner' as const,cuiRaw:correct!,nameDisplay:name!};
    expect(await resolveEntity(tx,input)).toBe(canonical!.id);
    expect(await resolveEntity(tx,input)).toBe(canonical!.id);
    expect((await tx.select().from(entities).where(eq(entities.id,placeholder!.id)))[0]?.cuiCanonical).toBeNull();
    expect((await tx.select().from(entitySicapIds).where(eq(entitySicapIds.sicapId,999991)))[0]?.entityId).toBe(placeholder!.id);
    await tx.insert(entityRedirects).values({oldId:placeholder!.id,canonicalId:canonical!.id,reason:'verified-test',evidence:{}});
    expect(await resolveEntity(tx,{...input,cuiRaw:typo!})).toBe(canonical!.id);
    throw rollback;
   })).rejects.toBe(rollback);
  });
 }
 it('quarantines conflicting valid identities rather than contaminating either profile',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.db.transaction(async tx=>{
   const [e]=await tx.insert(entities).values({nameDisplay:'Fixture',nameNormalized:'fixture',cuiCanonical:'33240921',cuiValid:true}).returning();
   await tx.insert(entitySicapIds).values({namespace:'winner',sicapId:999992,entityId:e!.id});
   await expect(resolveEntity(tx,{sicapId:999992,namespace:'winner',cuiRaw:'27390673',nameDisplay:'Fixture'})).rejects.toThrow('Conflicting valid CUI');
   throw rollback;
  })).rejects.toBe(rollback);
 });
 // Audit F27: Transelectrica typed its own CUI as the fiscal code of its supplier Energobit.
 it('keeps a reviewed-accepted authority CUI on the SICAP winner without touching the authority',async()=>{
  const rollback=new Error('rollback');
  await expect(connection!.db.transaction(async tx=>{
   const [supplier]=await tx.insert(entities).values({nameDisplay:'Energobit',nameNormalized:'energobit',cuiCanonical:'211717',cuiValid:true,cuiRawVariants:['RO 211717']}).returning();
   const [authority]=await tx.insert(entities).values({nameDisplay:'Transelectrica',nameNormalized:'transelectrica',cuiCanonical:'13328043',cuiValid:true}).returning();
   await tx.insert(entitySicapIds).values({namespace:'winner',sicapId:7355,entityId:supplier!.id});
   const source={sicapId:7355,cuiRaw:'RO 13328043',nameDisplay:'ENERGOBIT SA'};
   await expect(resolveEntity(tx,{namespace:'winner',...source})).rejects.toThrow('Conflicting valid CUI');
   expect(await resolveEntity(tx,{namespace:'winner',...reviewedWinnerIdentity(108300000,source)})).toBe(supplier!.id);
   const [after]=await tx.select().from(entities).where(eq(entities.id,supplier!.id));
   expect(after?.cuiCanonical).toBe('211717');expect(after?.cuiRawVariants).not.toContain('RO 13328043');
   expect((await tx.select().from(entitySicapIds).where(eq(entitySicapIds.entityId,authority!.id)))).toEqual([]);
   // A SICAP ID that no longer maps to the reviewed supplier CUI still fails.
   await tx.update(entities).set({cuiCanonical:'33240921'}).where(eq(entities.id,supplier!.id));
   await expect(resolveEntity(tx,{namespace:'winner',...reviewedWinnerIdentity(108300000,source)})).rejects.toThrow('Conflicting valid CUI');
   throw rollback;
  })).rejects.toBe(rollback);
 });
});
