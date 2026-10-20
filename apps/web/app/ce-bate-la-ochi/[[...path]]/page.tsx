import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStories } from '@/lib/stories/catalog';
import { canSeeStoryPreviews } from '@/lib/stories/access';
import { readView, countyLabel } from '@/lib/stories/shared';
import StoriesClient from '../StoriesClient';
import '../stories.css';
import '../stories-reader.css';
type Props={params:Promise<{path?:string[]}>};
export const dynamic='force-dynamic';
/** Until a story is published, the whole section exists only for admins. */
async function load(){const previews=await canSeeStoryPreviews(),stories=await getStories({previews});return previews||stories.length?stories:null;}
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {path=[]}=await params,stories=await load();if(!stories)return {robots:{index:false,follow:false}};const view=readView(path,stories);
 const story=view&&'slug' in view?stories.find(s=>s.slug===view.slug):undefined;
 return {title:view?.kind==='county'?`Povești din ${countyLabel(view.county)}`:story?.title??'Ce bate la ochi',description:story?.summary??'Povești documentate despre banii publici, cu cronologie, achiziții și surse la vedere.',...(stories.some(s=>s.status==='preview')?{robots:{index:false,follow:false}}:{})};
}
export default async function StoriesPage({params}:Props){const {path=[]}=await params,stories=await load();if(!stories)notFound();const view=readView(path,stories);if(!view)notFound();return <StoriesClient key={path.join('/')} stories={stories} initialView={view}/>;}
