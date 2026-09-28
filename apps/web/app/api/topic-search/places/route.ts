import {topicPlaces} from '@/lib/topic-search/server';
export async function GET(req:Request){try{return Response.json({places:await topicPlaces(new URL(req.url).searchParams.get('q')??'')},{headers:{'Cache-Control':'public, max-age=300'}});}catch{return Response.json({error:'Sugestiile nu sunt disponibile. Încearcă din nou.'},{status:503});}}
