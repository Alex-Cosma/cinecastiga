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
} as const;
export type StoryScene = keyof typeof STORY_SCENES;
export const isStoryScene = (key: string): key is StoryScene => Object.hasOwn(STORY_SCENES, key);
