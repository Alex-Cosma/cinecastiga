import {parseTopicScope} from '@/lib/topic-search/shared';
import {searchTopicDocuments,topicFailure} from '@/lib/topic-search/server';
export const dynamic='force-dynamic';
/** Matches in prepared document pages for the same selection as /api/topic-search. */
export async function GET(req:Request){
 let scope;try{scope=parseTopicScope(new URL(req.url).searchParams);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 try{return Response.json(await searchTopicDocuments(scope),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return topicFailure(e,'Căutarea în documente a durat prea mult. Adaugă un cuvânt, o localitate sau un interval de ani.');}
}
