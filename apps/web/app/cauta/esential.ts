import type {TopicScope} from '../../lib/topic-search/shared';

/**
 * Esențial (lib/view-mode.ts) hides /cauta's filters, the locality switch, the names' role select, the titles' sort
 * button and the documents. A shared link can carry one of them set: the control then shows in Esențial too, while the
 * address keeps it away from its default, so the reader sees the page is filtered and can undo it (owner, 18 November
 * 2026). Only what the address says counts: a place or a period read in the words is in „Am înțeles”, with its menu.
 */
export type SetFromAddress={place:boolean;period:boolean;type:boolean;match:boolean;hall:boolean;order:boolean;role:boolean;documents:boolean};
export function setFromAddress(s:TopicScope):SetFromAddress{
 return {place:Boolean(s.place),period:Boolean(s.from||s.to),type:s.type!=='all',match:s.match!=='words',hall:Boolean(s.hall),order:s.order==='value',role:Boolean(s.role),documents:s.tab==='documents'};
}
/** Any of the four filters of the „Loc, perioadă și alte filtre” row. */
export const filterSet=(set:SetFromAddress)=>set.place||set.period||set.type||set.match;
/** The mark of something Esențial hides unless `shown` (components/mode/mode.css): `data-only={completUnless(…)}`. */
export const completUnless=(shown:boolean):'complet'|undefined=>shown?undefined:'complet';
