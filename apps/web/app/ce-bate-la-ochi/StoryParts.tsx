import DiscoveryIcon from '../DiscoveryIcon';
import { formatExactDecimal } from '@/lib/format';
import { countyLabel,dateLabel,storyHref } from '@/lib/stories/shared';
import { patternLabel,scopeLabel } from '@/lib/stories/editorial';
import type {Story} from '@/lib/stories/types';
import StoryCover from './StoryCover';
export const money=(value:string)=>`${formatExactDecimal(value)} lei`;
export const teaser=(story:Story)=>story.teaser??story.summary;
export function Icon({name}:{name:'arrow'|'back'|'file'|'external'|'close'|'search'|'link'}) {return <DiscoveryIcon name={name==='back'?'arrow':name==='file'?'bookOpen':name} style={name==='back'?{transform:'rotate(180deg)'}:undefined}/>;}
export function StoryMeta({story}:{story:Story}) {return <div className="meta"><span>{story.topic}</span><span>{story.minutes} min de citit</span></div>;}
export function StoryTitle({story,className=''}:{story:Story;className?:string}) {return <a className={`story-link ${className}`} href={storyHref(story.slug)}>{story.title}<Icon name="arrow"/></a>;}
export function Patterns({story,limit=2}:{story:Story;limit?:number}) {return story.patterns?.length?<ul className="pattern-tags" aria-label="Tipare">{story.patterns.slice(0,limit).map(p=><li key={p}>{patternLabel(p)}</li>)}</ul>:null;}
export function StoryCard({story,shared=true,reason}:{story:Story;shared?:boolean;reason?:string}) {return <article className="story-card"><a className="cover-link" href={storyHref(story.slug)} aria-label={story.title} tabIndex={-1}><StoryCover story={story} {...(shared?{transition:`story-cover-${story.slug}`}:{})}/></a><div className="meta"><span title={story.counties.length>2?story.counties.map(countyLabel).join(', '):undefined}>{scopeLabel(story)} · {story.topic}</span><span>{story.minutes} min</span></div><StoryTitle story={story}/><p>{teaser(story)}</p>{reason?<span className="related-reason">{reason}</span>:<Patterns story={story}/>}<span className="quiet">{dateLabel(story.publishedAt)}</span></article>;}
