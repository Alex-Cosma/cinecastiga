import { publishedStories } from './published';
import { readPreviewStories } from './preview-files';
import { validateStory, visibleStories } from './validation';
/** Public editorial catalog plus, for admins, the server-only previews.
 * Synthetic test fixtures are never loaded by the application. */
export async function getStories({previews=false}:{previews?:boolean}={}) {
  const selected=visibleStories([...publishedStories,...(previews?await readPreviewStories():[])],previews);
  if(new Set(selected.map(s=>s.slug)).size!==selected.length)throw new Error("Duplicate editorial story slug");
  for(const story of selected)validateStory(story);
  return selected;
}
