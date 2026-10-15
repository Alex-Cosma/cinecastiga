import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Story } from './types';
import { validateStory } from './validation';

/** Unfinished reporting lives only on the server, never in the public repository:
 * one JSON `Story` per file in STORIES_PREVIEW_DIR (production: /srv/seap/stories,
 * mounted read-only). Only `preview` stories are accepted; an invalid file is
 * skipped and logged so one draft cannot take the section down. */
export async function readPreviewStories(dir=process.env.STORIES_PREVIEW_DIR, log:(m:string)=>void=console.error):Promise<Story[]> {
  if(!dir)return [];
  let names:string[];
  try { names=(await readdir(dir)).filter(n=>n.endsWith('.json')).sort(); }
  catch(error) { log(`Editorial previews unavailable: ${(error as Error).message}`);return []; }
  const stories:Story[]=[];
  for(const name of names){
    try {
      const story=JSON.parse(await readFile(join(dir,name),'utf8')) as Story;
      if(story.status!=='preview')throw new Error(`status must be preview, found ${String(story.status)}`);
      validateStory(story);stories.push(story);
    } catch(error) { log(`Editorial preview ${name} skipped: ${(error as Error).message}`); }
  }
  return stories;
}
