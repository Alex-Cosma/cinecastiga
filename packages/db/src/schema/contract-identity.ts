import {sql} from 'drizzle-orm';
import {bigint,bigserial,boolean,check,index,jsonb,text,timestamp,uuid} from 'drizzle-orm/pg-core';
import {martsSchema} from './marts.js';
/** Evidence inventory only: no candidate implicitly removes a source contract. */
export const contractIdentityCandidates=martsSchema.table('contract_identity_candidates',{
 id:text('id').primaryKey(),fingerprint:text('fingerprint').notNull(),
 status:text('status').notNull(),active:boolean('active').notNull().default(true),
 evidence:jsonb('evidence').notNull(),observedAt:timestamp('observed_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[check('contract_identity_status',sql`${t.status} in ('source_verified','needs_evidence','conflict')`)]);
/** Append-only snapshots: changes in source evidence never erase the previous finding. */
export const contractIdentityObservations=martsSchema.table('contract_identity_observations',{
 fingerprint:text('fingerprint').primaryKey(),candidateId:text('candidate_id').notNull().references(()=>contractIdentityCandidates.id),
 evidence:jsonb('evidence').notNull(),observedAt:timestamp('observed_at',{withTimezone:true}).notNull().defaultNow(),
});

/** Explicit approvals, bound to an immutable source verification. Additive only. */
export const contractIdentityDecisions=martsSchema.table('contract_identity_decisions',{
 candidateId:text('candidate_id').primaryKey().references(()=>contractIdentityCandidates.id),
 fingerprint:text('fingerprint').notNull().references(()=>contractIdentityObservations.fingerprint),
 canonicalContractId:bigint('canonical_contract_id',{mode:'bigint'}).notNull(),
 reason:text('reason').notNull(),approvedAt:timestamp('approved_at',{withTimezone:true}).notNull().defaultNow(),
});
export const contractIdentityMembers=martsSchema.table('contract_identity_members',{
 contractId:bigint('contract_id',{mode:'bigint'}).primaryKey(),
 candidateId:text('candidate_id').notNull().references(()=>contractIdentityDecisions.candidateId),
 snapshotHash:text('snapshot_hash').notNull(),
},t=>[index('contract_identity_members_candidate_idx').on(t.candidateId)]);

/** Append-only record of source-verified extensions and fingerprint renewals.
 * The original approval and every observation remain available. */
export const contractIdentityRevisions=martsSchema.table('contract_identity_revisions',{
 id:bigserial('id',{mode:'bigint'}).primaryKey(),
 candidateId:text('candidate_id').notNull().references(()=>contractIdentityCandidates.id),
 processingRunId:uuid('processing_run_id').notNull(),
 previousSnapshot:jsonb('previous_snapshot').notNull(),nextSnapshot:jsonb('next_snapshot').notNull(),
 verifiedAt:timestamp('verified_at',{withTimezone:true}).notNull().defaultNow(),
},t=>[index('contract_identity_revisions_candidate_idx').on(t.candidateId)]);
