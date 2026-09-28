import {parseTopicScope} from '@/lib/topic-search/shared';
import {searchTopics,TopicInputError} from '@/lib/topic-search/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 let scope;try{scope=parseTopicScope(new URL(req.url).searchParams);}catch(e){return Response.json({error:(e as Error).message},{status:400});}
 try{return Response.json(await searchTopics(scope),{headers:{'Cache-Control':'no-store'}});}
 catch(e){if(e instanceof TopicInputError)return Response.json({error:e.message},{status:400});const code=(e as {code?:string}).code;console.error('Topic search failed',code??'query');
 return Response.json({error:code==='57014'?'Căutarea este prea largă și a durat prea mult. Adaugă un cuvânt, o localitate sau un interval de ani.':'Căutarea nu este disponibilă momentan. Încearcă din nou în câteva momente.'},{status:503});}
}
