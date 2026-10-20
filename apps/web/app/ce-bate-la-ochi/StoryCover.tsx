import { useId } from 'react';
import { isStoryScene } from '@/lib/stories/scenes';
import type { Story } from '@/lib/stories/types';
import { StoryMotif } from './StoryArt';
import { SCENES } from './StoryScenes';
/** The story's own drawn scene; a generic motif until it has one. */
export default function StoryCover({story,transition}:{story:Story;transition?:string}){
 const p=`s${useId().replace(/[^a-zA-Z0-9]/g,'')}`;
 const Scene=story.scene&&isStoryScene(story.scene)?SCENES[story.scene]:null;
 return <div className={`cover ${Scene?'scene-cover':'motif-cover'}`} style={transition?{viewTransitionName:transition}:undefined}>
  {Scene?<svg viewBox="0 0 640 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><Scene p={p}/></svg>:story.illustration&&<StoryMotif kind={story.illustration}/>}
 </div>;
}
