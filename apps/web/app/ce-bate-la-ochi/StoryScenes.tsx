import type { ReactElement } from 'react';
import type { StoryScene } from '@/lib/stories/scenes';
/**
 * One drawn scene per story, in the site palette. Places and objects only: no people, no verdicts.
 * Drawn on a 640×400 canvas; keep the subject inside x 40–600 and y 50–350, which every crop shows.
 * `p` prefixes gradient ids, so the same scene can appear twice on one page.
 */
type Scene = (props: { p: string }) => ReactElement;

const Autostrada: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6dfc0"/><stop offset=".7" stopColor="#eef0e0"/></linearGradient>
 <linearGradient id={`${p}road`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d8a80"/><stop offset="1" stopColor="#3f5043"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <circle cx="468" cy="168" r="52" fill="#f3c38f" opacity=".75"/><circle cx="468" cy="168" r="34" fill="#f6d2a6"/>
 <path d="M0 236C110 200 210 214 318 198S520 168 640 196V400H0Z" fill="#c3d3b2"/>
 <path d="M0 262C130 232 250 254 372 238S560 214 640 236V400H0Z" fill="#a3ba8d"/>
 <path d="M0 300C150 276 330 290 640 266V400H0Z" fill="#7f9a6a"/>
 <path d="M30 400C170 340 330 284 432 244L452 244C380 292 300 344 330 400Z" fill={`url(#${p}road)`}/>
 <path d="M182 400C268 336 378 278 442 244" stroke="#fffefa" strokeWidth="4" strokeDasharray="18 16" fill="none"/>
 <path d="M30 400C170 340 330 284 432 244" stroke="#e8eddd" strokeWidth="2" fill="none" opacity=".8"/>
 <path d="M468 262h132l20 30H452Z" fill="#9aa69a"/>
 <path d="M480 266l-6 22M500 266l-4 22M520 266l-2 22M540 266v22M560 266l2 22M580 266l4 22" stroke="#fffefa" strokeWidth="1.5"/>
 <rect x="490" y="226" width="82" height="34" fill="#f1ead9"/><path d="M482 228h98l-8-12h-82Z" fill="#204c3c"/>
 <rect x="500" y="238" width="16" height="22" fill="#617f51"/><rect x="526" y="236" width="36" height="12" fill="#c9d8e0"/>
 <rect x="474" y="272" width="16" height="10" rx="3" fill="#f1ead9"/><rect x="545" y="272" width="16" height="10" rx="3" fill="#355d40"/>
 <g transform="translate(398 300)"><rect width="58" height="26" rx="4" fill="#c7522d"/><rect x="40" y="-12" width="20" height="20" rx="3" fill="#c7522d"/><rect x="44" y="-8" width="12" height="9" fill="#e7f0ef"/>
  <circle cx="12" cy="28" r="7" fill="#243a30"/><circle cx="46" cy="28" r="7" fill="#243a30"/><rect x="-14" y="18" width="16" height="6" rx="3" fill="#f2c48d"/><path d="M50-12v-8" stroke="#f2c48d" strokeWidth="4" strokeLinecap="round"/></g>
 <g fill="#355d40"><circle cx="70" cy="262" r="22"/><circle cx="102" cy="268" r="16"/><circle cx="50" cy="276" r="14"/><circle cx="596" cy="250" r="18"/><circle cx="576" cy="256" r="12"/></g>
 <path d="M70 282v18M102 282v14" stroke="#355d40" strokeWidth="4"/>
 <path d="M220 120l8 5 8-5M250 108l6 4 6-4" stroke="#7f9a6a" strokeWidth="2" fill="none" opacity=".6"/>
</>;

const Aerodrom: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe4e0"/><stop offset="1" stopColor="#f2f1e4"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <g fill="#fffefa" opacity=".9"><ellipse cx="150" cy="96" rx="58" ry="14"/><ellipse cx="186" cy="86" rx="34" ry="14"/><ellipse cx="520" cy="70" rx="44" ry="10"/></g>
 <path d="M0 238h640v162H0Z" fill="#b8cba4"/>
 <path d="M0 238c40-14 80-10 120-16s70 6 110 2 90-12 140-8 80 10 130 4 90-10 140 4v14H0Z" fill="#7f9a6a"/>
 <path d="M70 400 296 246h48L570 400Z" fill="#8e978d"/>
 <path d="M320 252v14M320 278v20M320 312v28M320 356v40" stroke="#fffefa" strokeWidth="5"/>
 <path d="M86 400 299 248M554 400 341 248" stroke="#fffefa" strokeWidth="2" opacity=".7"/>
 <path d="M44 252V206c0-30 46-44 80-44s80 14 80 44v46Z" fill="#ede6d3"/><path d="M72 252v-40h104v40Z" fill="#617f51"/>
 <path d="M98 212v40M124 212v40M150 212v40" stroke="#ede6d3" strokeWidth="2"/>
 <g transform="translate(404 124) rotate(-8)"><path d="M0 14c20-8 70-10 98-6 8 1 12 6 10 10-30 6-80 6-108 2Z" fill="#fffefa"/><path d="M40 6l-6-22h18l14 20Z" fill="#fffefa"/><path d="M38 18l-8 22h16l16-20Z" fill="#e8e3d4"/>
  <path d="M2 14-8-4H2l12 14Z" fill="#c7522d"/><path d="M10 15h86" stroke="#c7522d" strokeWidth="3"/><circle cx="94" cy="11" r="3" fill="#355d40"/></g>
 <g transform="translate(440 292)"><rect width="92" height="38" rx="5" fill="#c7522d"/><path d="M92 8h22l14 16v14H92Z" fill="#c7522d"/><path d="M96 12h16l10 12H96Z" fill="#e7f0ef"/>
  <rect x="8" y="-8" width="70" height="6" fill="#f1ead9"/><path d="M14-8v6M26-8v6M38-8v6M50-8v6M62-8v6" stroke="#c7522d" strokeWidth="2"/>
  <rect x="10" y="10" width="70" height="4" fill="#fffefa" opacity=".8"/><circle cx="22" cy="40" r="9" fill="#243a30"/><circle cx="104" cy="40" r="9" fill="#243a30"/><circle cx="22" cy="40" r="3" fill="#cbd4c3"/><circle cx="104" cy="40" r="3" fill="#cbd4c3"/></g>
 <path d="M448 286C408 210 350 196 310 214" stroke="#a9d1d6" strokeWidth="7" fill="none" strokeLinecap="round" opacity=".85"/>
 <g fill="#a9d1d6"><circle cx="306" cy="222" r="4"/><circle cx="298" cy="230" r="3"/><circle cx="310" cy="234" r="2.5"/></g>
 <path d="M568 300V214" stroke="#3f5043" strokeWidth="3"/><path d="M568 216l30 6v14l-30 4Z" fill="#fffefa"/><path d="M577 218v20M589 220v16" stroke="#c7522d" strokeWidth="6"/>
</>;

const Antigrindina: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5b6c66"/><stop offset=".55" stopColor="#9eab9c"/><stop offset="1" stopColor="#d9dfcc"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <g fill="#3e4d47"><circle cx="300" cy="76" r="70"/><circle cx="390" cy="64" r="62"/><circle cx="470" cy="90" r="52"/><circle cx="220" cy="102" r="48"/><circle cx="540" cy="110" r="40"/><rect x="180" y="102" width="400" height="44" rx="22"/></g>
 <path d="M200 142c30 10 60 4 90 8s70 8 110 2 80 4 120-4 40-6 40-6v8H200Z" fill="#55655e" opacity=".9"/>
 <g fill="#4a5a53"><ellipse cx="330" cy="46" rx="40" ry="18"/><ellipse cx="420" cy="40" rx="30" ry="14"/></g>
 <g fill="#fffefa" opacity=".8"><circle cx="400" cy="182" r="2.2"/><circle cx="430" cy="202" r="2"/><circle cx="460" cy="176" r="2.4"/><circle cx="490" cy="206" r="1.8"/><circle cx="380" cy="214" r="1.8"/><circle cx="444" cy="232" r="2.2"/><circle cx="512" cy="186" r="2"/><circle cx="470" cy="242" r="1.6"/></g>
 <path d="M0 270C120 256 260 262 400 252S560 246 640 254V400H0Z" fill="#8fa877"/>
 <g fill="#a9be92"><path d="M0 300 640 276v14L0 320Z"/><path d="M0 344 640 306v16L0 370Z"/></g>
 <g fill="#7f9a6a"><path d="M0 322 640 292v12L0 344Z"/><path d="M0 372 640 324v18L0 400Z"/></g>
 <rect x="128" y="226" width="70" height="40" fill="#ede6d3"/><path d="M122 228h82l-10-10h-62Z" fill="#355d40"/><rect x="140" y="240" width="14" height="26" fill="#617f51"/><rect x="164" y="238" width="24" height="12" fill="#c9d8e0"/>
 <path d="M226 266v-92" stroke="#e8e3d4" strokeWidth="4"/><path d="M214 266l12-40 12 40" stroke="#e8e3d4" strokeWidth="2" fill="none"/>
 <path d="M206 174a20 20 0 0 1 40 0Z" fill="#fffefa"/><circle cx="226" cy="168" r="3" fill="#c7522d"/>
 <path d="M262 262C282 210 306 180 330 156" stroke="#fffefa" strokeWidth="2.5" strokeDasharray="4 6" fill="none"/><circle cx="332" cy="152" r="5" fill="#f2c48d"/>
 <path d="M100 286H500M100 274h290M110 270v16M140 270v16M170 270v16M200 270v16M230 270v16M260 270v16M290 270v16M320 270v16M350 270v16M380 270v16" stroke="#3f5043" strokeWidth="2"/>
 <rect x="410" y="244" width="38" height="44" fill="#fffefa"/><path d="M404 246h50l-6-10h-38Z" fill="#c7522d"/><rect x="418" y="254" width="22" height="14" fill="#9ec0c6"/><rect x="410" y="276" width="38" height="5" fill="#c7522d"/>
 <path d="M452 270h86" stroke="#fffefa" strokeWidth="6"/><path d="M468 270h12M496 270h12M524 270h12" stroke="#c7522d" strokeWidth="6"/><rect x="448" y="266" width="8" height="22" fill="#3f5043"/>
</>;

const Aquapark: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f4d9b6"/><stop offset=".75" stopColor="#f3eee1"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <circle cx="140" cy="132" r="40" fill="#f6c99a" opacity=".85"/>
 <path d="M0 262C140 248 300 256 640 242V400H0Z" fill="#c9d6b8"/>
 <path d="M0 296C200 282 420 292 640 276V400H0Z" fill="#e8dcc4"/>
 <path d="M538 280V76M550 280V76M538 96l12 20M550 116l-12 20M538 136l12 20M550 156l-12 20M538 176l12 20M550 196l-12 20M538 216l12 20M550 236l-12 20M466 76h134M490 76l54-24 54 24M482 76v58" stroke="#355d40" strokeWidth="3" fill="none"/>
 <rect x="584" y="78" width="16" height="16" fill="#355d40"/><path d="M476 134h12v8h-12Z" fill="#c7522d"/>
 <path d="M330 284V120M380 284V120M330 140h50M330 180h50M330 220h50M330 260h50M330 140l50 40M380 180l-50 40M330 220l50 40" stroke="#7d8a80" strokeWidth="2.5"/>
 <rect x="320" y="110" width="70" height="12" rx="2" fill="#617f51"/>
 <path d="M384 124C470 124 470 196 400 200S300 236 330 268 452 270 470 300" stroke="#c7522d" strokeWidth="22" fill="none" strokeLinecap="round"/>
 <path d="M381 120C467 120 467 192 397 196S297 232 327 264 449 266 467 296" stroke="#e57f57" strokeWidth="7" fill="none" strokeLinecap="round"/>
 <path d="M326 140C250 150 236 200 270 222" stroke="#5f9e95" strokeWidth="20" fill="none" strokeLinecap="round"/>
 <path d="M270 222l26 14" stroke="#5f9e95" strokeWidth="20" strokeDasharray="4 8" opacity=".55"/>
 <path d="M60 320c0-14 10-22 24-22h190c16 0 26 8 26 22v14H60Z" fill="#dbe7e1"/><path d="M76 324h210" stroke="#b9cfc6" strokeWidth="2"/><path d="M60 334h240" stroke="#fffefa" strokeWidth="4"/>
 <path d="M116 304v20M156 304v20M196 304v20M236 304v20" stroke="#b9cfc6" strokeWidth="1.5"/>
 <rect x="380" y="316" width="96" height="16" rx="8" fill="#8e978d"/><ellipse cx="476" cy="324" rx="5" ry="8" fill="#3f5043"/>
 <rect x="500" y="322" width="84" height="16" rx="8" fill="#a5ada3"/><ellipse cx="500" cy="330" rx="5" ry="8" fill="#3f5043"/>
 <rect x="420" y="340" width="110" height="16" rx="8" fill="#7d8a80"/>
 <g fill="#355d40"><circle cx="40" cy="268" r="20"/><circle cx="604" cy="272" r="16"/></g>
</>;

/** The clock reads 7:44, when the first of the seven purchases was published. */
const Scoala: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f1d6b8"/><stop offset=".7" stopColor="#eef0e4"/></linearGradient>
 <linearGradient id={`${p}water`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9fd0d2"/><stop offset="1" stopColor="#5f9e95"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <circle cx="104" cy="150" r="34" fill="#f6c99a"/>
 <g fill="#cfd8c6"><rect x="0" y="120" width="70" height="200"/><rect x="150" y="96" width="60" height="220"/><rect x="430" y="110" width="80" height="210"/><rect x="560" y="140" width="80" height="180"/></g>
 <path d="M10 136h12v8H10ZM34 136h12v8H34ZM10 160h12v8H10ZM34 160h12v8H34ZM162 112h10v8h-10ZM186 112h10v8h-10ZM162 136h10v8h-10ZM186 136h10v8h-10ZM444 126h12v8h-12ZM470 126h12v8h-12ZM444 150h12v8h-12ZM470 150h12v8h-12Z" fill="#e2e8da"/>
 <rect x="80" y="178" width="300" height="146" fill="#f1ead9"/><rect x="80" y="170" width="300" height="12" fill="#204c3c"/>
 <g fill="#8fa877"><rect x="100" y="196" width="26" height="30" rx="2"/><rect x="144" y="196" width="26" height="30" rx="2"/><rect x="290" y="196" width="26" height="30" rx="2"/><rect x="334" y="196" width="26" height="30" rx="2"/>
  <rect x="100" y="244" width="26" height="30" rx="2"/><rect x="144" y="244" width="26" height="30" rx="2"/><rect x="290" y="244" width="26" height="30" rx="2"/><rect x="334" y="244" width="26" height="30" rx="2"/></g>
 <g fill="#f6dcae" opacity=".9"><rect x="104" y="200" width="18" height="10"/><rect x="294" y="248" width="18" height="10"/></g>
 <rect x="196" y="150" width="68" height="174" fill="#e7ddc6"/><path d="M190 152h80l-40-26Z" fill="#204c3c"/>
 <circle cx="230" cy="186" r="20" fill="#fffefa" stroke="#204c3c" strokeWidth="3"/>
 <path d="M230 186l-9.5 7.4" stroke="#243a30" strokeWidth="3.5" strokeLinecap="round"/><path d="M230 186l-16.4-1.7" stroke="#c7522d" strokeWidth="2.5" strokeLinecap="round"/><circle cx="230" cy="186" r="2.5" fill="#243a30"/>
 <rect x="212" y="268" width="36" height="56" fill="#617f51"/><path d="M230 268v56" stroke="#f1ead9" strokeWidth="2"/>
 <path d="M290 170V108" stroke="#3f5043" strokeWidth="2"/><path d="M291 110h22v6h-22Z" fill="#2b4a9b"/><path d="M291 116h22v6h-22Z" fill="#f2c94c"/><path d="M291 122h22v6h-22Z" fill="#c7522d"/>
 <path d="M380 236h196v88H380Z" fill="#e7ddc6"/><path d="M374 238 476 206 582 238Z" fill="#355d40"/>
 <rect x="396" y="252" width="164" height="54" rx="3" fill={`url(#${p}water)`}/>
 <path d="M396 268c20-4 40 4 60 0s40-4 60 0 30 2 44 0M396 286c20-4 40 4 60 0s40-4 60 0 30 2 44 0" stroke="#fffefa" strokeWidth="2" opacity=".7" fill="none"/>
 <path d="M437 252v54M478 252v54M519 252v54" stroke="#e7ddc6" strokeWidth="3"/>
 <path d="M0 324h640v76H0Z" fill="#a3ba8d"/><path d="M0 330h640v14H0Z" fill="#dcd3bf"/>
 <g fill="#355d40"><circle cx="48" cy="300" r="24"/><circle cx="596" cy="296" r="22"/><circle cx="576" cy="310" r="14"/></g><path d="M48 318v14M596 316v16" stroke="#355d40" strokeWidth="5"/>
</>;

export const SCENES: Record<StoryScene, Scene> = {
  'autostrada-parcare': Autostrada,
  'aerodrom-pompieri': Aerodrom,
  'antigrindina-furtuna': Antigrindina,
  'aquapark-santier': Aquapark,
  'scoala-bazin': Scoala,
};
