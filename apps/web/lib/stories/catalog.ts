import { publishedStories } from './published';
import { validateStory, visibleStories } from './validation';
/** Public editorial catalog; synthetic test fixtures are never loaded by the application. */
export async function getStories() {
  const previews=process.env.NODE_ENV==='development' ? (await import('./local-preview')).localPreviewStories : [];
  const selected=visibleStories([...publishedStories,...previews],process.env.NODE_ENV);
  if(new Set(selected.map(s=>s.slug)).size!==selected.length)throw new Error("Duplicate editorial story slug");
  for(const story of selected)validateStory(story);
  return selected;
}
