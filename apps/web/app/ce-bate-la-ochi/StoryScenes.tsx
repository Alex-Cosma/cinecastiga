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

const Cadastru: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d3e6e6"/><stop offset="1" stopColor="#f5f1e1"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <g fill="#fffefa" opacity=".9"><ellipse cx="470" cy="84" rx="60" ry="13"/><ellipse cx="500" cy="74" rx="32" ry="13"/><ellipse cx="140" cy="70" rx="40" ry="9"/></g>
 <path d="M0 190C80 160 150 170 220 150S360 132 440 156 560 150 640 168V400H0Z" fill="#b9cbb0"/>
 <path d="M0 222C120 198 220 210 330 198S520 188 640 206V400H0Z" fill="#9fb68c"/>
 <rect x="94" y="178" width="44" height="30" fill="#f1ead9"/><path d="M90 180l26-18 26 18Z" fill="#355d40"/>
 <rect x="99" y="146" width="16" height="36" fill="#f1ead9"/><path d="M97 148q10-20 20 0Z" fill="#355d40"/><path d="M107 132v-10M103 126h8" stroke="#355d40" strokeWidth="2"/>
 <rect x="104" y="190" width="8" height="18" fill="#617f51"/><rect x="120" y="186" width="8" height="8" fill="#c9d8e0"/>
 <g><rect x="170" y="196" width="26" height="16" fill="#f1ead9"/><path d="M166 198l17-12 17 12Z" fill="#c7522d"/>
  <rect x="214" y="200" width="22" height="13" fill="#f1ead9"/><path d="M210 202l15-10 15 10Z" fill="#a9573c"/>
  <rect x="262" y="196" width="26" height="15" fill="#efe4cf"/><path d="M258 198l17-12 17 12Z" fill="#c7522d"/></g>
 <g fill="#617f51"><ellipse cx="560" cy="196" rx="8" ry="30"/><ellipse cx="580" cy="200" rx="7" ry="26"/><ellipse cx="600" cy="196" rx="8" ry="30"/><ellipse cx="620" cy="202" rx="7" ry="24"/></g>
 <path d="M0 228H640V400H0Z" fill="#c7d6a8"/>
 <path d="M0 236 210 232 170 300 0 312Z" fill="#d8c58e"/><path d="M210 232 420 230 440 296 170 300Z" fill="#a9be8a"/><path d="M420 230 640 232V306L440 296Z" fill="#8fa877"/>
 <path d="M0 312 170 300 130 400H0Z" fill="#b6c993"/><path d="M170 300 440 296 470 400H130Z" fill="#e2d6a6"/><path d="M440 296 640 306V400H470Z" fill="#c4d39f"/>
 <path d="M220 316l-10 84M260 314l-4 86M350 312l6 88M400 310l12 90" stroke="#d3c48f" strokeWidth="2"/>
 <path d="M0 312 170 300 440 296 640 306M210 232 170 300 130 400M420 230 440 296 470 400" stroke="#fffefa" strokeWidth="2" strokeDasharray="7 6" fill="none"/>
 <g stroke="#3f5043" strokeWidth="2.5"><path d="M170 300v-26M440 296v-24M210 232v-16M420 230v-16"/></g>
 <g fill="#c7522d"><path d="M171 274l14 5-14 5Z"/><path d="M441 272l14 5-14 5Z"/><path d="M211 216l10 4-10 4Z"/><path d="M421 214l10 4-10 4Z"/></g>
 <path d="M520 300V250" stroke="#c7522d" strokeWidth="3"/><circle cx="520" cy="246" r="6" fill="#fffefa" stroke="#3f5043" strokeWidth="2"/>
 <path d="M318 262 514 247" stroke="#c7522d" strokeWidth="1.5" strokeDasharray="4 5"/>
 <path d="M300 288l-26 66M300 288v70M300 288l26 66" stroke="#3f5043" strokeWidth="3.5" strokeLinecap="round"/>
 <rect x="286" y="282" width="28" height="7" rx="2" fill="#3f5043"/>
 <rect x="289" y="250" width="22" height="32" rx="4" fill="#e8b04a"/><rect x="284" y="257" width="34" height="10" rx="4" fill="#3f5043"/><circle cx="318" cy="262" r="3" fill="#c9d8e0"/><rect x="294" y="270" width="12" height="7" fill="#c9d8e0"/>
</>;

const SpitalIarna: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c3cad6"/><stop offset="1" stopColor="#eef0ee"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <circle cx="150" cy="100" r="30" fill="#f6efe0" opacity=".85"/>
 <path d="M0 200 80 142l60 34 70-58 80 62 70-50 80 40 80-60 80 50 40-20V400H0Z" fill="#a3adb4"/>
 <g fill="#f7f8f4"><path d="M200 126l10-8 14 12-10 4Z"/><path d="M350 138l10-8 12 10-12 2Z"/><path d="M508 122l12-12 16 14-14 2Z"/><path d="M72 150l8-8 12 8Z"/></g>
 <path d="M0 236C100 214 200 226 320 212S520 200 640 214V400H0Z" fill="#6f8571"/>
 <g fill="#4d6650"><path d="M24 232l14-34 14 34Z"/><path d="M46 230l12-28 12 28Z"/><path d="M560 218l14-36 14 36Z"/><path d="M586 220l12-30 12 30Z"/><path d="M606 216l13-32 13 32Z"/></g>
 <path d="M0 268C160 256 360 262 640 252V400H0Z" fill="#f7f8f4"/>
 <path d="M0 300C200 292 420 296 640 288" stroke="#e1e6e9" strokeWidth="10" fill="none"/>
 <rect x="70" y="194" width="240" height="74" fill="#efe6d2"/><path d="M62 196 82 172H298l20 24Z" fill="#8e5a48"/><path d="M80 174H300l4 6H76Z" fill="#fffefa"/>
 <g fill="#f6d58e"><rect x="88" y="206" width="16" height="18"/><rect x="118" y="206" width="16" height="18"/><rect x="148" y="206" width="16" height="18"/><rect x="216" y="206" width="16" height="18"/><rect x="246" y="206" width="16" height="18"/><rect x="276" y="206" width="16" height="18"/>
  <rect x="88" y="236" width="16" height="18"/><rect x="118" y="236" width="16" height="18"/><rect x="246" y="236" width="16" height="18"/><rect x="276" y="236" width="16" height="18"/></g>
 <g fill="#c9d3d6"><rect x="148" y="236" width="16" height="18"/><rect x="216" y="236" width="16" height="18"/></g>
 <rect x="176" y="232" width="28" height="36" fill="#617f51"/><path d="M170 232h40l-4-8h-32Z" fill="#355d40"/><path d="M168 226h44" stroke="#fffefa" strokeWidth="3"/>
 <rect x="360" y="212" width="90" height="56" fill="#d9d0bf"/><path d="M356 214h98v-6h-98Z" fill="#fffefa"/><rect x="376" y="230" width="22" height="38" fill="#7d8a80"/><rect x="412" y="226" width="26" height="14" fill="#c9d3d6"/>
 <rect x="430" y="108" width="16" height="104" fill="#b5a99a"/><path d="M430 120h16M430 134h16" stroke="#c7522d" strokeWidth="4"/>
 <g fill="#fffefa" opacity=".85"><ellipse cx="446" cy="96" rx="14" ry="9"/><ellipse cx="466" cy="80" rx="18" ry="11"/><ellipse cx="494" cy="64" rx="22" ry="12"/><ellipse cx="530" cy="52" rx="24" ry="11" opacity=".7"/></g>
 <rect x="470" y="232" width="88" height="32" rx="16" fill="#e8e3d4"/><path d="M478 232c10-6 62-6 72 0" stroke="#fffefa" strokeWidth="5" fill="none"/><path d="M482 264v8M546 264v8" stroke="#7d8a80" strokeWidth="4"/>
 <g transform="translate(420 300)"><rect x="0" y="0" width="120" height="34" rx="17" fill="#c7522d"/><path d="M10 8h100" stroke="#e57f57" strokeWidth="3"/><rect x="120" y="4" width="34" height="34" rx="4" fill="#c7522d"/><rect x="128" y="10" width="20" height="12" fill="#e7f0ef"/>
  <rect x="-4" y="30" width="162" height="8" fill="#3f5043"/><circle cx="24" cy="42" r="9" fill="#243a30"/><circle cx="62" cy="42" r="9" fill="#243a30"/><circle cx="138" cy="42" r="9" fill="#243a30"/></g>
 <path d="M424 312C400 300 470 290 490 264" stroke="#3f5043" strokeWidth="3" fill="none"/>
 <path d="M300 400C340 360 360 340 420 336M330 400C370 362 390 346 430 344" stroke="#dfe5e8" strokeWidth="3" fill="none"/>
 <g fill="#fffefa"><circle cx="60" cy="120" r="2"/><circle cx="240" cy="80" r="2"/><circle cx="330" cy="150" r="1.6"/><circle cx="600" cy="110" r="2"/><circle cx="380" cy="60" r="1.6"/></g>
</>;

const StatiiIncarcare: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f4a52"/><stop offset=".6" stopColor="#9a8a7a"/><stop offset="1" stopColor="#f0bf8c"/></linearGradient>
 <radialGradient id={`${p}glow`}><stop offset="0" stopColor="#9fe0c4" stopOpacity=".55"/><stop offset="1" stopColor="#9fe0c4" stopOpacity="0"/></radialGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <g fill="#fffefa" opacity=".8"><circle cx="90" cy="40" r="1.5"/><circle cx="220" cy="60" r="1.2"/><circle cx="360" cy="30" r="1.5"/><circle cx="480" cy="54" r="1.2"/><circle cx="590" cy="36" r="1.5"/></g>
 <path d="M0 214C90 190 170 206 260 190S440 176 520 194 600 186 640 196V400H0Z" fill="#5c6b62"/>
 <rect x="30" y="120" width="130" height="180" fill="#46564f"/><rect x="460" y="136" width="150" height="164" fill="#4f5f58"/><rect x="180" y="170" width="90" height="130" fill="#56665f"/>
 <g fill="#f6d58e"><rect x="44" y="136" width="14" height="10"/><rect x="88" y="136" width="14" height="10"/><rect x="66" y="160" width="14" height="10"/><rect x="132" y="160" width="14" height="10"/><rect x="44" y="184" width="14" height="10"/><rect x="110" y="208" width="14" height="10"/><rect x="66" y="232" width="14" height="10"/><rect x="132" y="256" width="14" height="10"/>
  <rect x="476" y="152" width="14" height="10"/><rect x="520" y="152" width="14" height="10"/><rect x="564" y="176" width="14" height="10"/><rect x="498" y="200" width="14" height="10"/><rect x="586" y="224" width="14" height="10"/><rect x="476" y="248" width="14" height="10"/><rect x="542" y="248" width="14" height="10"/>
  <rect x="194" y="186" width="12" height="9"/><rect x="236" y="206" width="12" height="9"/><rect x="214" y="246" width="12" height="9"/></g>
 <g fill="#6c7a73"><rect x="66" y="136" width="14" height="10"/><rect x="110" y="136" width="14" height="10"/><rect x="88" y="184" width="14" height="10"/><rect x="498" y="152" width="14" height="10"/><rect x="542" y="200" width="14" height="10"/></g>
 <path d="M0 300H640V400H0Z" fill="#5f6b66"/><path d="M0 300H640" stroke="#8e978d" strokeWidth="4"/>
 <path d="M150 400 200 316M290 400 310 316M430 400 420 316M570 400 530 316" stroke="#fffefa" strokeWidth="2" opacity=".5"/>
 <path d="M500 300V190" stroke="#2f3e3a" strokeWidth="4"/><path d="M500 192h26" stroke="#2f3e3a" strokeWidth="4"/><rect x="516" y="190" width="20" height="6" rx="2" fill="#f6e7b8"/>
 <path d="M518 196 466 300H590Z" fill="#f6e7b8" opacity=".18"/>
 <g><circle cx="231" cy="270" r="40" fill={`url(#${p}glow)`}/><circle cx="301" cy="270" r="40" fill={`url(#${p}glow)`}/><circle cx="371" cy="270" r="40" fill={`url(#${p}glow)`}/></g>
 <g fill="#fffefa"><rect x="220" y="244" width="22" height="58" rx="4"/><rect x="290" y="244" width="22" height="58" rx="4"/><rect x="360" y="244" width="22" height="58" rx="4"/></g>
 <g fill="#5fbf98"><rect x="225" y="252" width="12" height="9" rx="1"/><rect x="295" y="252" width="12" height="9" rx="1"/><rect x="365" y="252" width="12" height="9" rx="1"/></g>
 <g fill="#204c3c"><rect x="226" y="268" width="10" height="4"/><rect x="296" y="268" width="10" height="4"/><rect x="366" y="268" width="10" height="4"/></g>
 <g transform="translate(316 300)"><path d="M0 40V22c0-6 4-10 10-12l26-14c6-3 12-4 18-4h40c8 0 14 3 20 8l18 16c8 1 14 6 14 12v12Z" fill="#c7522d"/>
  <path d="M42 12 60-2h26l16 14Z" fill="#2f3e44"/><circle cx="34" cy="42" r="12" fill="#243a30"/><circle cx="118" cy="42" r="12" fill="#243a30"/><circle cx="34" cy="42" r="4" fill="#8e978d"/><circle cx="118" cy="42" r="4" fill="#8e978d"/><rect x="138" y="20" width="8" height="5" rx="2" fill="#f6e7b8"/></g>
 <path d="M302 280C320 300 322 316 330 318" stroke="#243a30" strokeWidth="3" fill="none"/>
</>;

const Zacamant: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#c8deea"/><stop offset="1" stopColor="#f4efe0"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <circle cx="96" cy="86" r="30" fill="#f6dba6"/>
 <path d="M0 200C100 170 200 186 300 166S480 150 640 176V400H0Z" fill="#b7c6a4"/>
 <path d="M478 168h76v-18h-76Z" fill="#a59c8c"/><rect x="502" y="112" width="20" height="40" fill="#a59c8c"/><path d="M500 114l12-22 12 22Z" fill="#7d6e62"/><path d="M478 150l8-6 8 6 8-6M530 150l8-6 8 6 8-6" stroke="#a59c8c" strokeWidth="3" fill="none"/>
 <path d="M0 230C140 214 300 224 640 206V400H0Z" fill="#d9c98e"/>
 <path d="M0 254C180 240 380 248 640 232V400H0Z" fill="#a9be8a"/>
 <path d="M60 300 600 286 640 400H0Z" fill="#d6d2c6"/>
 <path d="M206 296H470" stroke="#8e978d" strokeWidth="7"/><path d="M206 296v-26" stroke="#8e978d" strokeWidth="7"/>
 <rect x="194" y="196" width="24" height="80" fill="#617f51"/><rect x="186" y="214" width="40" height="10" fill="#355d40"/><rect x="186" y="246" width="40" height="10" fill="#355d40"/><rect x="198" y="186" width="16" height="12" fill="#355d40"/>
 <g fill="#c7522d"><circle cx="180" cy="219" r="8"/><circle cx="232" cy="219" r="8"/><circle cx="180" cy="251" r="8"/><circle cx="206" cy="182" r="7"/></g>
 <g fill="#f1ead9"><circle cx="180" cy="219" r="3"/><circle cx="232" cy="219" r="3"/><circle cx="180" cy="251" r="3"/></g>
 <path d="M160 296V270h92v26" stroke="#7d8a80" strokeWidth="2" fill="none"/>
 <rect x="280" y="286" width="210" height="14" fill="#6c746b"/>
 <rect x="292" y="244" width="86" height="42" rx="12" fill="#204c3c"/><path d="M300 254h70M300 264h70M300 274h70" stroke="#355d40" strokeWidth="2"/>
 <rect x="378" y="258" width="16" height="16" fill="#8e978d"/>
 <rect x="394" y="246" width="70" height="40" rx="8" fill="#c7522d"/><circle cx="428" cy="266" r="12" fill="#e57f57"/><circle cx="428" cy="266" r="4" fill="#c7522d"/>
 <path d="M464 262h40V210h40" stroke="#8e978d" strokeWidth="7" fill="none"/>
 <rect x="530" y="196" width="40" height="96" fill="#f1ead9"/><path d="M530 196c0-8 40-8 40 0" fill="#e2dccb"/><rect x="576" y="214" width="34" height="78" fill="#ece5d4"/><path d="M576 214c0-7 34-7 34 0" fill="#ddd6c4"/>
 <path d="M538 290l22-90" stroke="#a5ada3" strokeWidth="2"/>
 <path d="M44 300V140" stroke="#7d8a80" strokeWidth="5"/><path d="M44 140c-8-10-2-22 4-28 0 10 8 14 4 28Z" fill="#e8913f"/><path d="M45 138c-3-5 0-10 2-12 0 5 3 7 1 12Z" fill="#f6d58e"/>
</>;

const PazaNoapte: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#132620"/><stop offset="1" stopColor="#2f4d41"/></linearGradient>
 <radialGradient id={`${p}lamp`}><stop offset="0" stopColor="#f6e7b8" stopOpacity=".6"/><stop offset="1" stopColor="#f6e7b8" stopOpacity="0"/></radialGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <circle cx="530" cy="78" r="22" fill="#f3ead2"/><circle cx="540" cy="72" r="20" fill="#1a2f27"/>
 <g fill="#fffefa"><circle cx="90" cy="50" r="1.5"/><circle cx="170" cy="90" r="1.2"/><circle cx="260" cy="40" r="1.5"/><circle cx="410" cy="70" r="1.2"/><circle cx="610" cy="120" r="1.5"/><circle cx="350" cy="110" r="1"/></g>
 <g fill="#1c3329"><circle cx="40" cy="250" r="40"/><circle cx="600" cy="244" r="44"/><circle cx="80" cy="262" r="30"/></g>
 <path d="M140 300V164H500V300Z" fill="#c9c2ae"/>
 <path d="M126 166 320 108 514 166Z" fill="#d9d2c0"/><path d="M150 160 320 118 490 160Z" fill="#bdb5a0"/>
 <path d="M320 108V80" stroke="#8e978d" strokeWidth="2"/><path d="M321 82h20v5h-20Z" fill="#2b4a9b"/><path d="M321 87h20v5h-20Z" fill="#f2c94c"/><path d="M321 92h20v5h-20Z" fill="#c7522d"/>
 <g fill="#e6dfcb"><rect x="176" y="172" width="12" height="112"/><rect x="226" y="172" width="12" height="112"/><rect x="276" y="172" width="12" height="112"/><rect x="352" y="172" width="12" height="112"/><rect x="402" y="172" width="12" height="112"/><rect x="452" y="172" width="12" height="112"/></g>
 <g fill="#f6d58e"><rect x="196" y="190" width="20" height="28"/><rect x="372" y="236" width="20" height="28"/><rect x="422" y="190" width="20" height="28"/></g>
 <g fill="#5c6b62"><rect x="246" y="190" width="20" height="28"/><rect x="196" y="236" width="20" height="28"/><rect x="246" y="236" width="20" height="28"/><rect x="372" y="190" width="20" height="28"/><rect x="422" y="236" width="20" height="28"/></g>
 <rect x="298" y="226" width="44" height="58" fill="#3f5043"/>
 <path d="M128 284H512V300H128Z" fill="#b2ab97"/><path d="M110 300H530V312H110Z" fill="#a39c88"/>
 <path d="M0 312H640V400H0Z" fill="#26392f"/>
 <path d="M30 330H430M40 330v-22M80 330v-22M120 330v-22M160 330v-22M200 330v-22M240 330v-22M280 330v-22M320 330v-22M360 330v-22M400 330v-22M30 312H430" stroke="#0f1e18" strokeWidth="3"/>
 <rect x="530" y="262" width="54" height="60" fill="#e8e3d4"/><path d="M522 264h70l-8-12h-54Z" fill="#c7522d"/><rect x="540" y="274" width="34" height="22" fill="#f6d58e"/><rect x="530" y="308" width="54" height="5" fill="#c7522d"/>
 <path d="M440 296h86" stroke="#fffefa" strokeWidth="6"/><path d="M452 296h12M480 296h12M508 296h12" stroke="#c7522d" strokeWidth="6"/><rect x="522" y="290" width="8" height="32" fill="#3f5043"/>
 <path d="M100 320V150" stroke="#46564f" strokeWidth="4"/><path d="M100 156l24 8" stroke="#46564f" strokeWidth="4"/><rect x="116" y="158" width="30" height="14" rx="3" fill="#d9d2c0" transform="rotate(18 116 158)"/><circle cx="142" cy="176" r="2.5" fill="#e0533a"/>
 <path d="M144 172 230 250 190 270Z" fill="#f6e7b8" opacity=".08"/>
 <circle cx="40" cy="180" r="34" fill={`url(#${p}lamp)`}/><path d="M40 320V180" stroke="#46564f" strokeWidth="3"/><circle cx="40" cy="180" r="5" fill="#f6e7b8"/>
 <circle cx="610" cy="180" r="34" fill={`url(#${p}lamp)`}/><path d="M610 320V180" stroke="#46564f" strokeWidth="3"/><circle cx="610" cy="180" r="5" fill="#f6e7b8"/>
</>;

const Cantina: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}view`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe4e0"/><stop offset="1" stopColor="#eef0e0"/></linearGradient></defs>
 <rect width="640" height="400" fill="#f1e8d4"/>
 <rect y="236" width="640" height="26" fill="#cfdcc4"/>
 <path d="M0 262H640V400H0Z" fill="#ddd2bb"/>
 <path d="M0 290H640M0 326H640M0 370H640M80 262 40 400M200 262 180 400M320 262V400M440 262 460 400M560 262 600 400" stroke="#cfc3aa" strokeWidth="1.5"/>
 <rect x="372" y="54" width="232" height="168" fill={`url(#${p}view)`}/>
 <path d="M372 196h232v26H372Z" fill="#a9be8a"/><rect x="420" y="150" width="120" height="50" fill="#f1ead9"/><path d="M414 152h132l-10-14H424Z" fill="#c7522d"/>
 <g fill="#8fa877"><rect x="432" y="160" width="12" height="14"/><rect x="456" y="160" width="12" height="14"/><rect x="492" y="160" width="12" height="14"/><rect x="516" y="160" width="12" height="14"/></g>
 <circle cx="404" cy="172" r="24" fill="#617f51"/><path d="M404 190v14" stroke="#355d40" strokeWidth="5"/>
 <path d="M372 54h232v168H372ZM488 54v168M372 138h232" stroke="#204c3c" strokeWidth="6" fill="none"/>
 <circle cx="134" cy="92" r="26" fill="#fffefa" stroke="#204c3c" strokeWidth="4"/><path d="M134 92V72" stroke="#243a30" strokeWidth="3.5" strokeLinecap="round"/><path d="M134 92v20" stroke="#c7522d" strokeWidth="2.5" strokeLinecap="round"/><circle cx="134" cy="92" r="2.5" fill="#243a30"/>
 <path d="M250 0v44M330 0v30" stroke="#8e978d" strokeWidth="2"/><path d="M234 44h32l-6-10h-20Z" fill="#355d40"/><path d="M314 30h32l-6-10h-20Z" fill="#355d40"/>
 <g><rect x="40" y="196" width="104" height="44" rx="6" fill="#5f9e95"/><rect x="40" y="190" width="104" height="10" rx="4" fill="#c7522d"/><rect x="52" y="212" width="80" height="12" rx="2" fill="#e7f0ef"/>
  <rect x="44" y="246" width="104" height="44" rx="6" fill="#5f9e95"/><rect x="44" y="240" width="104" height="10" rx="4" fill="#c7522d"/><rect x="56" y="262" width="80" height="12" rx="2" fill="#e7f0ef"/>
  <rect x="160" y="226" width="90" height="64" rx="6" fill="#4f8a82"/><rect x="160" y="220" width="90" height="10" rx="4" fill="#c7522d"/><rect x="172" y="246" width="66" height="12" rx="2" fill="#e7f0ef"/></g>
 <path d="M0 330 640 298V320L0 356Z" fill="#c9a57a"/><path d="M0 356 640 320V330L0 368Z" fill="#a8845c"/>
 <path d="M60 362v38M300 344v56M560 326v74" stroke="#7d6a52" strokeWidth="6"/>
 <g transform="translate(70 318) skewY(-2.8)"><rect width="120" height="34" rx="6" fill="#e7ece4"/><ellipse cx="30" cy="17" rx="20" ry="11" fill="#fffefa"/><ellipse cx="30" cy="16" rx="15" ry="7" fill="#e0a25a"/><rect x="58" y="6" width="54" height="22" rx="4" fill="#fffefa"/><circle cx="74" cy="17" r="7" fill="#8fa877"/><rect x="86" y="12" width="20" height="10" rx="3" fill="#e8c88e"/></g>
 <g transform="translate(270 304) skewY(-2.8)"><rect width="120" height="34" rx="6" fill="#e7ece4"/><ellipse cx="30" cy="17" rx="20" ry="11" fill="#fffefa"/><ellipse cx="30" cy="16" rx="15" ry="7" fill="#e0a25a"/><rect x="58" y="6" width="54" height="22" rx="4" fill="#fffefa"/><circle cx="76" cy="17" r="8" fill="#c7522d"/><rect x="88" y="12" width="18" height="10" rx="3" fill="#e8c88e"/></g>
 <g transform="translate(470 292) skewY(-2.8)"><rect width="120" height="34" rx="6" fill="#e7ece4"/><ellipse cx="30" cy="17" rx="20" ry="11" fill="#fffefa"/><ellipse cx="30" cy="16" rx="15" ry="7" fill="#e0a25a"/><rect x="58" y="6" width="54" height="22" rx="4" fill="#fffefa"/><circle cx="74" cy="17" r="7" fill="#8fa877"/><rect x="86" y="12" width="20" height="10" rx="3" fill="#e8c88e"/></g>
</>;

const DrumSat: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d4e8e3"/><stop offset="1" stopColor="#f6efdf"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <circle cx="530" cy="80" r="28" fill="#f6dba6"/>
 <path d="M0 180C80 140 170 160 250 140S400 120 480 150 580 140 640 150V400H0Z" fill="#9fb68c"/>
 <path d="M0 214C120 196 220 206 330 194S520 186 640 198V400H0Z" fill="#7f9a6a"/>
 <path d="M0 226H640V400H0Z" fill="#b8cba4"/>
 <path d="M90 400 316 226h28L560 400Z" fill="#c8b896"/>
 <path d="M90 400 168 340H472L560 400Z" fill="#3f5043"/>
 <path d="M168 340 228 294H422L472 340Z" fill="#56665f"/>
 <path d="M228 294 268 262H384L422 294Z" fill="#b9a982"/>
 <path d="M268 262 316 226h28L384 262Z" fill="#d4c7a6"/>
 <path d="M320 400V350M320 330V306M320 290V272" stroke="#fffefa" strokeWidth="4" opacity=".8"/>
 <g><path d="M150 352l8-20 8 20Z" fill="#c7522d"/><path d="M152 346h12" stroke="#fffefa" strokeWidth="3"/><path d="M474 352l8-20 8 20Z" fill="#c7522d"/><path d="M476 346h12" stroke="#fffefa" strokeWidth="3"/>
  <path d="M214 304l6-15 6 15Z" fill="#c7522d"/><path d="M216 300h8" stroke="#fffefa" strokeWidth="2.5"/><path d="M424 304l6-15 6 15Z" fill="#c7522d"/><path d="M426 300h8" stroke="#fffefa" strokeWidth="2.5"/>
  <path d="M258 270l5-12 5 12Z" fill="#c7522d"/><path d="M386 270l5-12 5 12Z" fill="#c7522d"/></g>
 <g fontFamily="IBM Plex Sans,system-ui,sans-serif" fontWeight="700" textAnchor="middle">
  <path d="M120 360v-40M500 320v-28" stroke="#7d6a52" strokeWidth="2.5"/>
  <rect x="106" y="304" width="28" height="20" rx="2" fill="#fffefa" stroke="#3f5043" strokeWidth="1.5"/><text x="120" y="319" fontSize="14" fill="#243a30">1</text>
  <rect x="488" y="278" width="24" height="17" rx="2" fill="#fffefa" stroke="#3f5043" strokeWidth="1.5"/><text x="500" y="291" fontSize="12" fill="#243a30">2</text>
  <path d="M206 290v-20M440 270v-16" stroke="#7d6a52" strokeWidth="2"/>
  <rect x="196" y="258" width="20" height="14" rx="2" fill="#fffefa" stroke="#3f5043" strokeWidth="1.2"/><text x="206" y="269" fontSize="10" fill="#243a30">3</text>
  <rect x="431" y="244" width="18" height="12" rx="2" fill="#fffefa" stroke="#3f5043" strokeWidth="1.2"/><text x="440" y="254" fontSize="9" fill="#243a30">4</text></g>
 <g transform="translate(250 298)"><rect x="40" y="-14" width="56" height="26" rx="4" fill="#c7522d"/><path d="M58-14v-22h34v22" stroke="#3f5043" strokeWidth="3" fill="none"/><path d="M54-38h42" stroke="#3f5043" strokeWidth="5"/>
  <rect x="0" y="-4" width="40" height="30" rx="15" fill="#8e978d"/><rect x="6" y="2" width="28" height="4" rx="2" fill="#a5ada3"/><circle cx="82" cy="18" r="11" fill="#243a30"/><circle cx="82" cy="18" r="4" fill="#8e978d"/></g>
 <g><rect x="20" y="236" width="70" height="44" fill="#f1ead9"/><path d="M14 238l41-26 41 26Z" fill="#c7522d"/><rect x="30" y="250" width="14" height="14" fill="#c9d8e0"/><rect x="60" y="256" width="14" height="24" fill="#617f51"/>
  <rect x="200" y="222" width="44" height="26" fill="#efe4cf"/><path d="M196 224l26-16 26 16Z" fill="#a9573c"/>
  <rect x="560" y="236" width="70" height="44" fill="#efe4cf"/><path d="M554 238l41-26 41 26Z" fill="#a9573c"/><rect x="574" y="250" width="14" height="14" fill="#c9d8e0"/>
  <rect x="404" y="222" width="44" height="26" fill="#f1ead9"/><path d="M400 224l26-16 26 16Z" fill="#c7522d"/></g>
 <path d="M0 296h80M0 290h80M8 286v14M28 286v14M48 286v14M68 286v14M560 292h80M560 286h80M570 282v14M590 282v14M610 282v14M630 282v14" stroke="#8a6f52" strokeWidth="2"/>
 <g fill="#4d6a46"><circle cx="150" cy="222" r="20"/><circle cx="500" cy="220" r="18"/></g>
</>;

const SpitalSchele: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f2dcc6"/><stop offset=".75" stopColor="#eef0e4"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <path d="M470 236h130v-30H470Z" fill="#d4cab8"/>
 <rect x="512" y="92" width="38" height="146" fill="#cbbfac"/><path d="M506 94l25-46 25 46Z" fill="#6b5b4e"/><path d="M506 94h50" stroke="#a69780" strokeWidth="4"/>
 <g fill="#8a7a68"><rect x="526" y="110" width="8" height="14" rx="4"/><rect x="526" y="150" width="8" height="14" rx="4"/><rect x="526" y="190" width="8" height="14" rx="4"/></g>
 <g fill="#7f9a6a"><circle cx="480" cy="222" r="20"/><circle cx="600" cy="220" r="24"/></g>
 <path d="M0 290C160 280 360 286 640 276V400H0Z" fill="#a3ba8d"/>
 <rect x="56" y="118" width="380" height="186" fill="#f1ead9"/><rect x="50" y="110" width="392" height="12" fill="#204c3c"/>
 <g fill="#8fa877"><rect x="74" y="136" width="22" height="24"/><rect x="110" y="136" width="22" height="24"/><rect x="146" y="136" width="22" height="24"/><rect x="182" y="136" width="22" height="24"/><rect x="218" y="136" width="22" height="24"/>
  <rect x="74" y="178" width="22" height="24"/><rect x="110" y="178" width="22" height="24"/><rect x="146" y="178" width="22" height="24"/><rect x="182" y="178" width="22" height="24"/><rect x="218" y="178" width="22" height="24"/>
  <rect x="74" y="220" width="22" height="24"/><rect x="110" y="220" width="22" height="24"/><rect x="182" y="220" width="22" height="24"/><rect x="218" y="220" width="22" height="24"/></g>
 <rect x="138" y="252" width="56" height="52" fill="#c9d8e0"/><path d="M130 252h72v-10h-72Z" fill="#c7522d"/><path d="M166 252v52" stroke="#f1ead9" strokeWidth="2"/>
 <rect x="256" y="112" width="186" height="192" fill="#8fa877" opacity=".45"/>
 <path d="M262 112V304M306 112V304M350 112V304M394 112V304M438 112V304" stroke="#7d8a80" strokeWidth="3"/>
 <path d="M256 150H444M256 190H444M256 230H444M256 270H444" stroke="#d9a35a" strokeWidth="6"/>
 <path d="M262 150 306 190M350 190 394 230M306 230 350 270" stroke="#7d8a80" strokeWidth="2"/>
 <path d="M0 304H640" stroke="#cfc7b5" strokeWidth="20"/>
 <g><rect x="276" y="318" width="20" height="24" rx="3" fill="#fffefa"/><rect x="276" y="318" width="20" height="5" fill="#c7522d"/><rect x="302" y="324" width="18" height="18" rx="3" fill="#fffefa"/><rect x="302" y="324" width="18" height="4" fill="#5f9e95"/></g>
 <path d="M340 342 360 250M368 342 388 250M344 324h22M348 304h22M352 284h22M356 264h22" stroke="#a8845c" strokeWidth="3"/>
 <g transform="translate(450 302)"><rect x="0" y="0" width="120" height="46" rx="6" fill="#fffefa"/><path d="M120 12h22l14 18v16h-36Z" fill="#fffefa"/><path d="M124 16h16l10 14h-26Z" fill="#c9d8e0"/><rect x="0" y="24" width="156" height="6" fill="#c7522d"/>
  <path d="M46 8v14M39 15h14" stroke="#c7522d" strokeWidth="4"/><rect x="40" y="-8" width="20" height="8" rx="2" fill="#6fa0c9"/><circle cx="28" cy="48" r="10" fill="#243a30"/><circle cx="130" cy="48" r="10" fill="#243a30"/><circle cx="28" cy="48" r="4" fill="#cbd4c3"/><circle cx="130" cy="48" r="4" fill="#cbd4c3"/></g>
</>;

const CamineSera: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d8eae6"/><stop offset="1" stopColor="#f5f1e3"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <g fill="#fffefa" opacity=".9"><ellipse cx="110" cy="70" rx="48" ry="11"/><ellipse cx="140" cy="62" rx="26" ry="11"/></g>
 <path d="M386 74V250M398 74V250M386 94l12 18M398 112l-12 18M386 130l12 18M398 148l-12 18M386 166l12 18M398 184l-12 18M300 74h170M330 74l62-26 62 26M320 74v40" stroke="#355d40" strokeWidth="3" fill="none"/>
 <rect x="456" y="76" width="16" height="16" fill="#355d40"/><rect x="314" y="114" width="12" height="10" fill="#c7522d"/>
 <g fontFamily="IBM Plex Sans,system-ui,sans-serif" fontWeight="700" fontSize="12" textAnchor="middle" fill="#fffefa">
  <rect x="236" y="130" width="96" height="160" fill="#e7ddc6"/><rect x="266" y="118" width="36" height="16" rx="2" fill="#204c3c"/><text x="284" y="130">A5</text>
  <rect x="352" y="112" width="100" height="178" fill="#efe6d2"/><rect x="384" y="100" width="36" height="16" rx="2" fill="#204c3c"/><text x="402" y="112">A6</text>
  <rect x="472" y="138" width="96" height="152" fill="#e7ddc6"/><rect x="502" y="126" width="36" height="16" rx="2" fill="#204c3c"/><text x="520" y="138">A7</text></g>
 <g fill="#9fb3a8"><rect x="248" y="146" width="14" height="12"/><rect x="276" y="146" width="14" height="12"/><rect x="304" y="146" width="14" height="12"/><rect x="248" y="172" width="14" height="12"/><rect x="276" y="172" width="14" height="12"/><rect x="304" y="172" width="14" height="12"/><rect x="248" y="198" width="14" height="12"/><rect x="276" y="198" width="14" height="12"/><rect x="304" y="198" width="14" height="12"/><rect x="248" y="224" width="14" height="12"/><rect x="304" y="224" width="14" height="12"/>
  <rect x="484" y="154" width="14" height="12"/><rect x="512" y="154" width="14" height="12"/><rect x="540" y="154" width="14" height="12"/><rect x="484" y="180" width="14" height="12"/><rect x="512" y="180" width="14" height="12"/><rect x="540" y="180" width="14" height="12"/><rect x="484" y="206" width="14" height="12"/><rect x="540" y="206" width="14" height="12"/><rect x="512" y="232" width="14" height="12"/></g>
 <path d="M352 120H452M352 150H452M352 180H452M352 210H452M352 240H452M352 270H452" stroke="#d9a35a" strokeWidth="5"/>
 <path d="M358 112V290M392 112V290M426 112V290M450 112V290" stroke="#7d8a80" strokeWidth="2.5"/>
 <path d="M0 270C160 262 360 268 640 258V400H0Z" fill="#a9be8a"/>
 <path d="M300 400C330 340 360 300 420 290" stroke="#e5dcc6" strokeWidth="22" fill="none"/>
 <path d="M40 330V276c0-40 190-40 190 0v54Z" fill="#dbe9e2" opacity=".9"/>
 <path d="M40 276c0-40 190-40 190 0M88 252v78M135 246v84M182 252v78M40 300h190" stroke="#fffefa" strokeWidth="3" fill="none"/>
 <g fill="#5f8f55"><circle cx="64" cy="318" r="7"/><circle cx="84" cy="320" r="6"/><circle cx="110" cy="318" r="7"/><circle cx="156" cy="320" r="6"/><circle cx="200" cy="318" r="7"/><circle cx="214" cy="320" r="6"/></g>
 <path d="M30 330H240" stroke="#7d8a80" strokeWidth="4"/>
 <g><circle cx="580" cy="300" r="30" fill="#f0c9c0"/><circle cx="560" cy="290" r="18" fill="#f5d8d0"/><path d="M582 330v22" stroke="#6b5b4e" strokeWidth="5"/>
  <circle cx="276" cy="306" r="22" fill="#f0c9c0"/><path d="M276 328v18" stroke="#6b5b4e" strokeWidth="4"/></g>
 <g fill="#fffefa"><circle cx="570" cy="286" r="2"/><circle cx="590" cy="304" r="2"/><circle cx="268" cy="300" r="2"/></g>
</>;

const RacordElectric: Scene = ({ p }) => <>
 <defs><linearGradient id={`${p}sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#d5dcdc"/><stop offset="1" stopColor="#f3efe2"/></linearGradient></defs>
 <rect width="640" height="400" fill={`url(#${p}sky)`}/>
 <g fill="#fffefa" opacity=".85"><ellipse cx="420" cy="70" rx="70" ry="16"/><ellipse cx="460" cy="58" rx="40" ry="15"/><ellipse cx="160" cy="90" rx="50" ry="11"/></g>
 <path d="M0 196C60 160 140 150 220 176S300 200 360 196V400H0Z" fill="#b4c3a6"/>
 <g fill="#a59c8c"><rect x="70" y="140" width="110" height="30"/><rect x="62" y="122" width="22" height="48"/><rect x="166" y="126" width="22" height="44"/><rect x="112" y="112" width="26" height="58"/></g>
 <path d="M62 122h22M166 126h22M112 112h26" stroke="#8a8172" strokeWidth="4"/>
 <path d="M0 236C140 224 320 230 640 220V400H0Z" fill="#a9be8a"/>
 <path d="M560 236V120M548 132h24M552 142h16" stroke="#7d8a80" strokeWidth="3"/><path d="M572 132C610 150 640 150 660 146M548 132C500 150 470 160 440 162" stroke="#5c6b62" strokeWidth="1.2" fill="none"/>
 <rect x="360" y="136" width="190" height="150" fill="#ece5d4"/><rect x="354" y="128" width="202" height="10" fill="#355d40"/>
 <g fill="#8fa877"><rect x="376" y="150" width="18" height="16"/><rect x="406" y="150" width="18" height="16"/><rect x="436" y="150" width="18" height="16"/><rect x="466" y="150" width="18" height="16"/><rect x="496" y="150" width="18" height="16"/><rect x="526" y="150" width="14" height="16"/>
  <rect x="376" y="182" width="18" height="16"/><rect x="406" y="182" width="18" height="16"/><rect x="436" y="182" width="18" height="16"/><rect x="496" y="182" width="18" height="16"/><rect x="526" y="182" width="14" height="16"/>
  <rect x="376" y="214" width="18" height="16"/><rect x="436" y="214" width="18" height="16"/><rect x="466" y="214" width="18" height="16"/><rect x="496" y="214" width="18" height="16"/></g>
 <rect x="440" y="246" width="34" height="40" fill="#617f51"/>
 <g fill="#d9935a"><circle cx="600" cy="250" r="22"/><circle cx="620" cy="266" r="14"/></g><g fill="#e2b65a"><circle cx="330" cy="244" r="18"/></g>
 <rect x="226" y="246" width="66" height="54" fill="#e0dbcd"/><path d="M222 248h74l-6-8h-62Z" fill="#7d8a80"/><rect x="236" y="258" width="22" height="42" fill="#c9c2ae"/>
 <path d="M273 258l-7 12h7l-6 12" stroke="#c7522d" strokeWidth="3" fill="none" strokeLinejoin="round"/>
 <path d="M292 306H440l10 10H282Z" fill="#6b5340"/><path d="M296 310H444" stroke="#243a30" strokeWidth="3"/>
 <path d="M290 304c10-14 30-14 40 0M400 304c10-12 26-12 36 0" fill="#b08a64"/>
 <g transform="translate(150 300)"><circle r="34" fill="#b98a5a"/><circle r="24" fill="#3f5043"/><circle r="9" fill="#8e6a46"/><path d="M-34 0h68" stroke="#8e6a46" strokeWidth="2"/><path d="M-10 34h20" stroke="#6b5340" strokeWidth="6"/></g>
 <path d="M150 300C200 316 250 316 300 310" stroke="#243a30" strokeWidth="3" fill="none"/>
 <g transform="translate(470 296)"><rect x="0" y="0" width="74" height="30" rx="4" fill="#c7522d"/><rect x="44" y="-26" width="30" height="28" rx="3" fill="#c7522d"/><rect x="50" y="-20" width="18" height="14" fill="#e7f0ef"/>
  <rect x="-6" y="30" width="86" height="14" rx="7" fill="#3f5043"/><path d="M10 2 -24-34 -50 4" stroke="#c7522d" strokeWidth="9" fill="none" strokeLinecap="round"/><path d="M-50 4l-10 10h16Z" fill="#3f5043"/></g>
</>;

export const SCENES: Record<StoryScene, Scene> = {
  'autostrada-parcare': Autostrada,
  'aerodrom-pompieri': Aerodrom,
  'antigrindina-furtuna': Antigrindina,
  'aquapark-santier': Aquapark,
  'scoala-bazin': Scoala,
  'cadastru-parcele': Cadastru,
  'spital-iarna-combustibil': SpitalIarna,
  'statii-incarcare-seara': StatiiIncarcare,
  'zacamant-pompe': Zacamant,
  'paza-noapte': PazaNoapte,
  'cantina-scolara': Cantina,
  'drum-sat-tronsoane': DrumSat,
  'spital-schele': SpitalSchele,
  'camine-sera': CamineSera,
  'racord-electric': RacordElectric,
};
