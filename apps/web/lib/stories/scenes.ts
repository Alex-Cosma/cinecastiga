/**
 * Drawn illustrations, one per story. Each depicts the place or object of the story, never a person
 * and never a verdict. The drawings live in app/ce-bate-la-ochi/StoryScenes.tsx; a new story adds its
 * scene there and its description here.
 */
export const STORY_SCENES = {
  'autostrada-parcare': 'Autostradă la răsărit, cu o parcare de servicii și un utilaj de curățenie.',
  'aerodrom-pompieri': 'Aerodrom cu hangar, un avion mic și o autospecială de pompieri.',
  'antigrindina-furtuna': 'Nor de furtună peste câmpuri, o stație cu radar și o gheretă de pază cu barieră.',
  'aquapark-santier': 'Tobogane pe schelă, o macara, un bazin gol și țevi încă neracordate.',
  'scoala-bazin': 'Clădirea unei școli dimineața, cu ceasul la 7:44 și o aripă cu bazin.',
  'cadastru-parcele': 'Parcele de teren cu jaloane și o stație totală de măsurat, sub dealuri, cu biserica satului.',
  'spital-iarna-combustibil': 'Iarnă la munte: pavilionul unui spital, centrala termică cu coș și o cisternă de combustibil.',
  'statii-incarcare-seara': 'Seară între blocuri: stații de încărcare și o mașină electrică la încărcat.',
  'zacamant-pompe': 'Zăcământ pe dealurile Transilvaniei: capul de sondă, o pompă de injecție și rezervoare.',
  'paza-noapte': 'Noaptea, la sediul unei primării: gheretă de pază, barieră și cameră de supraveghere.',
  'cantina-scolara': 'Cantina unei școli: tăvi cu mâncare și cutii termoizolante de catering.',
  'drum-sat-tronsoane': 'Stradă de sat în lucru, în patru tronsoane marcate, cu un compactor.',
  'spital-schele': 'Spital cu schele pe fațadă, o ambulanță și Turnul Chindiei în fundal.',
  'camine-sera': 'Trei cămine studențești în reabilitare, o macara și sera universității.',
  'racord-electric': 'Cămin studențesc, post de transformare, șanț cu cablu și excavator; cetatea pe deal.',
} as const;
export type StoryScene = keyof typeof STORY_SCENES;
export const isStoryScene = (key: string): key is StoryScene => Object.hasOwn(STORY_SCENES, key);
