import {LITERAL_QUERY_MAX,LITERAL_TOO_LONG,parseTopicScope} from '@/lib/topic-search/shared';
import {searchTopics,topicFailure} from '@/lib/topic-search/server';
export const dynamic='force-dynamic';
/** Titles, institutions and firms. Documents come from ./documents, requested separately. */
export async function GET(req:Request){
 let scope;try{scope=parseTopicScope(new URL(req.url).searchParams);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 // the words of a long question are read (./interpretation), never searched as they are
 if(scope.q.length>LITERAL_QUERY_MAX)return Response.json({error:LITERAL_TOO_LONG},{status:400});
 try{return Response.json(await searchTopics(scope),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return topicFailure(e,'Căutarea este prea largă și a durat prea mult. Adaugă un cuvânt, o localitate sau un interval de ani.');}
}
