import DiscoveryIcon from '../DiscoveryIcon';
import { formatExactDecimal } from '@/lib/format';
import { countyLabel,dateLabel,storyHref } from '@/lib/stories/shared';
import type {Story} from '@/lib/stories/types';
import StoryArt from './StoryArt';
export const money=(value:string)=>`${formatExactDecimal(value)} lei`;
export function Icon({name}:{name:'arrow'|'back'|'file'|'external'|'close'|'search'|'link'}) {return <DiscoveryIcon name={name==='back'?'arrow':name==='file'?'bookOpen':name} style={name==='back'?{transform:'rotate(180deg)'}:undefined}/>;}
export function StoryMeta({story}:{story:Story}) {return <div className="meta"><span>{story.topic}</span><span>{story.minutes} min de citit</span></div>;}
export function StoryTitle({story,className=''}:{story:Story;className?:string}) {return <a className={`story-link ${className}`} href={storyHref(story.slug)}>{story.title}<Icon name="arrow"/></a>;}
export function StoryCard({story,shared=true}:{story:Story;shared?:boolean}) {return <article className="story-card"><a className="cover-link" href={storyHref(story.slug)} aria-label={story.title}><StoryArt kind={story.illustration} {...(shared?{transition:`story-cover-${story.slug}`}:{})}/></a><div className="meta"><span>{story.counties.map(countyLabel).join(', ')} · {story.topic}</span><span>{story.minutes} min</span></div><StoryTitle story={story}/><p>{story.summary}</p><span className="quiet">{dateLabel(story.publishedAt)}</span></article>;}
