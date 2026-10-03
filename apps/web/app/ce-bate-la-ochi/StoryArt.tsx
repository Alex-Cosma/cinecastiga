import type { StoryArt as ArtKind } from '@/lib/stories/types';
/** The same vector drawings as the existing homepage QuestionArt. */
export default function StoryArt({kind,transition}:{kind:ArtKind;transition?:string}) {
 return <div className={`cover art-${kind}`} style={transition?{viewTransitionName:transition}:undefined}>
  <svg viewBox="0 0 310 105" aria-hidden="true">
   {kind==='road'?<><path className="d-art-land" d="M0 78c43-43 93-21 139-43s114-20 171 2v67H0Z"/><path className="d-art-road" d="M-10 100C43 85 70 23 127 36s37 59 83 52 63-59 113-64"/><path className="d-art-road-line" d="M-10 100C43 85 70 23 127 36s37 59 83 52 63-59 113-64"/><path className="d-art-stroke" d="M57 30v23m-8-15 8-10 8 10M251 63v22m-8-14 8-10 8 10"/><circle className="d-art-highlight" cx="205" cy="87" r="7"/></>:kind==='hospital'?<><rect className="d-art-land" x="51" y="62" width="207" height="42" rx="4"/><path className="d-art-building" d="M116 103V28h80v75M73 103V58h43m80 0h42v45"/><path className="d-art-stroke" d="M138 100V81h36v19M131 63h9m31 0h9M88 75h9m-9 13h9m113-13h9m-9 13h9"/><path className="d-art-highlight-stroke" d="M156 36v19m-10-10h20"/><path className="d-art-stroke" d="M44 103h224"/></>:<><path className="d-art-connections" d="M72 32 152 65 234 29M73 89l79-24 83 24M152 65V14"/><circle className="d-art-land" cx="152" cy="65" r="23"/><circle className="d-art-node" cx="72" cy="32" r="14"/><circle className="d-art-node" cx="73" cy="89" r="10"/><circle className="d-art-node" cx="234" cy="29" r="16"/><circle className="d-art-highlight" cx="235" cy="89" r="12"/><circle className="d-art-node" cx="152" cy="14" r="8"/><path className="d-art-stroke" d="M143 72V56h18v16m-21 0h24m-16-12h8m-8 5h8"/></>}
  </svg><span className="cover-caption">Ilustrație editorială</span>
 </div>;
}
