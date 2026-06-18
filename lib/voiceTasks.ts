// In-Vehicle Voice Command task content. 10 groups (G1..G10), each with 5
// tasks in fixed order: Reading (warm-up), Navigation, Cockpit control, Media,
// Communication. Prompts are verbatim from the data-collection guideline.
//
// Per participant the group order is ROTATED (Latin square) so each content
// group lands on a different round across participants — see groupSequenceFor().
// Round 1 is the sober baseline.

import type { ImageSourcePropType } from 'react-native';

export type TaskType = 'reading' | 'navigation' | 'cockpit' | 'media' | 'communication';

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  reading: 'Reading (warm-up)',
  navigation: 'Navigation',
  cockpit: 'Cockpit control',
  media: 'Media',
  communication: 'Communication',
};

export interface VoiceTask {
  taskCode: string; // R1, N1, C1, ... — unique within the study
  group: number; // 1..10
  type: TaskType;
  promptLines: string[]; // paragraphs shown beneath the picture, in order
}

export const NUM_GROUPS = 10;
export const TASKS_PER_GROUP = 5;
export const TASK_ORDER: TaskType[] = ['reading', 'navigation', 'cockpit', 'media', 'communication'];

// One picture per group, shared by that group's 5 tasks. Placeholder files live
// in assets/voice/g{1..10}.jpg — overwrite them with the real driving images.
export const GROUP_IMAGE: Record<number, ImageSourcePropType> = {
  1: require('../assets/voice/g1.jpg'),
  2: require('../assets/voice/g2.jpg'),
  3: require('../assets/voice/g3.jpg'),
  4: require('../assets/voice/g4.jpg'),
  5: require('../assets/voice/g5.jpg'),
  6: require('../assets/voice/g6.jpg'),
  7: require('../assets/voice/g7.jpg'),
  8: require('../assets/voice/g8.jpg'),
  9: require('../assets/voice/g9.jpg'),
  10: require('../assets/voice/g10.jpg'),
};

const DRIVE = 'Imagine you are driving:';
const reading = (cmd: string): string[] => [
  "Imagine you're driving, and you want to give your vehicle the following command:",
  `"${cmd}"`,
  'Please read it aloud.',
];
const task = (situation: string, instruction: string): string[] => [DRIVE, situation, instruction];

// Groups in canonical order G1..G10. The 5 tasks per group are R, N, C, M, K.
export const GROUPS: VoiceTask[][] = [
  // Group 1 — sober baseline content for participant 1
  [
    { taskCode: 'R1', group: 1, type: 'reading', promptLines: reading('Hey Car, set the temperature to 65 and play my driving playlist.') },
    { taskCode: 'N1', group: 1, type: 'navigation', promptLines: task("The low-fuel light just came on while you're on the freeway.", 'Tell the car to take you somewhere to refuel.') },
    { taskCode: 'C1', group: 1, type: 'cockpit', promptLines: task("It's getting too warm inside, and there's exhaust smell from the road.", 'Tell the car to cool things down and keep the outside air out.') },
    { taskCode: 'M1', group: 1, type: 'media', promptLines: task("You're settled in and want to hear the music you like.", 'Tell the car to put your music on.') },
    { taskCode: 'K1', group: 1, type: 'communication', promptLines: task("You're running behind and need to let your mom know.", "Tell the car to text her you'll be a little late.") },
  ],
  // Group 2
  [
    { taskCode: 'R2', group: 2, type: 'reading', promptLines: reading('Hey Car, navigate to the nearest gas station and call Sarah.') },
    { taskCode: 'N2', group: 2, type: 'navigation', promptLines: task('You want a coffee before your next meeting.', 'Tell the car to take you to the Starbucks on Main Street.') },
    { taskCode: 'C2', group: 2, type: 'cockpit', promptLines: task("The windshield is starting to fog up and it's hard to see.", 'Tell the car to turn on the windshield defroster.') },
    { taskCode: 'M2', group: 2, type: 'media', promptLines: task("It's a long drive and you want to catch up on a show you follow.", 'Tell the car to play your podcast.') },
    { taskCode: 'K2', group: 2, type: 'communication', promptLines: task('You need to reach your coworker David.', 'Tell the car to call David.') },
  ],
  // Group 3
  [
    { taskCode: 'R3', group: 3, type: 'reading', promptLines: reading("Hey Car, turn on the seat heater and text Steve I'm running late.") },
    { taskCode: 'N3', group: 3, type: 'navigation', promptLines: task('You have to drop a package at a specific address.', 'Tell the car to navigate to 1450 Elm Street.') },
    { taskCode: 'C3', group: 3, type: 'cockpit', promptLines: task("It's a cold morning and your hands are freezing on the wheel.", 'Tell the car to warm up your hands.') },
    { taskCode: 'M3', group: 3, type: 'media', promptLines: task("The song that's playing really isn't your taste.", 'Tell the car to change it.') },
    { taskCode: 'K3', group: 3, type: 'communication', promptLines: task('You want to order food from the pizza place before you get home.', 'Tell the car to call them.') },
  ],
  // Group 4
  [
    { taskCode: 'R4', group: 4, type: 'reading', promptLines: reading('Hey Car, find a coffee shop downtown and turn the volume up.') },
    { taskCode: 'N4', group: 4, type: 'navigation', promptLines: task("You're running late for a flight.", 'Tell the car to get you to the airport as fast as possible.') },
    { taskCode: 'C4', group: 4, type: 'cockpit', promptLines: task('The air inside feels stuffy.', 'Tell the car to open the sunroof.') },
    { taskCode: 'M4', group: 4, type: 'media', promptLines: task('The music is too quiet to hear clearly.', 'Tell the car to make it louder.') },
    { taskCode: 'K4', group: 4, type: 'communication', promptLines: task('Your phone buzzes with a new text message.', 'Tell the car to find out what it says.') },
  ],
  // Group 5
  [
    { taskCode: 'R5', group: 5, type: 'reading', promptLines: reading('Hey Car, switch to the sports station and close the passenger window.') },
    { taskCode: 'N5', group: 5, type: 'navigation', promptLines: task("You've finished all your errands for the day.", 'Tell the car to take you home.') },
    { taskCode: 'C5', group: 5, type: 'cockpit', promptLines: task("It's getting dark out and the road ahead is hard to see.", 'Tell the car to turn the lights on.') },
    { taskCode: 'M5', group: 5, type: 'media', promptLines: task('You want to catch the latest news.', 'Tell the car to play the news.') },
    { taskCode: 'K5', group: 5, type: 'communication', promptLines: task('You just heard a message and want to respond.', "Tell the car to let them know you're on your way.") },
  ],
  // Group 6
  [
    { taskCode: 'R6', group: 6, type: 'reading', promptLines: reading('Hey Car, take me to the airport and skip to the next song.') },
    { taskCode: 'N6', group: 6, type: 'navigation', promptLines: task("You're not feeling well and need to pick up some medicine.", 'Tell the car to find the closest place to get it.') },
    { taskCode: 'C6', group: 6, type: 'cockpit', promptLines: task('It just started raining and the windshield is getting wet.', 'Tell the car to turn on the windshield wipers.') },
    { taskCode: 'M6', group: 6, type: 'media', promptLines: task("You're in the mood for something upbeat.", 'Tell the car to play something with energy.') },
    { taskCode: 'K6', group: 6, type: 'communication', promptLines: task("Your friend Alex wants to know when you'll arrive.", 'Tell the car to let Alex know your arrival time.') },
  ],
  // Group 7
  [
    { taskCode: 'R7', group: 7, type: 'reading', promptLines: reading('Hey Car, lower the temperature two degrees and start my podcast.') },
    { taskCode: 'N7', group: 7, type: 'navigation', promptLines: task("Your electric car's battery is getting low.", 'Tell the car to find the closest place to charge.') },
    { taskCode: 'C7', group: 7, type: 'cockpit', promptLines: task("You're feeling cold.", 'Tell the car to make it warmer inside.') },
    { taskCode: 'M7', group: 7, type: 'media', promptLines: task('You want to relax and wind down on the drive.', 'Tell the car to play something relaxing.') },
    { taskCode: 'K7', group: 7, type: 'communication', promptLines: task("You don't want to forget to grab milk later.", 'Tell the car to set a reminder to buy milk.') },
  ],
  // Group 8
  [
    { taskCode: 'R8', group: 8, type: 'reading', promptLines: reading('Hey Car, call the office and turn on the windshield defroster.') },
    { taskCode: 'N8', group: 8, type: 'navigation', promptLines: task('Traffic is backing up ahead of you.', 'Tell the car to find a faster route.') },
    { taskCode: 'C8', group: 8, type: 'cockpit', promptLines: task("The fan is blowing hard and it's getting noisy.", 'Tell the car to lower the fan speed.') },
    { taskCode: 'M8', group: 8, type: 'media', promptLines: task('You were listening to an audiobook earlier and want to continue.', 'Tell the car to pick up where it left off.') },
    { taskCode: 'K8', group: 8, type: 'communication', promptLines: task('You missed a call a moment ago.', 'Tell the car to get back to whoever called.') },
  ],
  // Group 9
  [
    { taskCode: 'R9', group: 9, type: 'reading', promptLines: reading('Hey Car, play some jazz and set a reminder to buy groceries.') },
    { taskCode: 'N9', group: 9, type: 'navigation', promptLines: task("You're almost at the stadium but need somewhere to park.", 'Tell the car to find parking nearby.') },
    { taskCode: 'C9', group: 9, type: 'cockpit', promptLines: task("You've just parked and you're about to step out.", 'Tell the car to lock the doors after you leave.') },
    { taskCode: 'M9', group: 9, type: 'media', promptLines: task('The volume is too loud now.', 'Tell the car to make it quieter.') },
    { taskCode: 'K9', group: 9, type: 'communication', promptLines: task("A call is coming in, but you can't take it right now.", 'Tell the car to decline the call.') },
  ],
  // Group 10
  [
    { taskCode: 'R10', group: 10, type: 'reading', promptLines: reading('Hey Car, navigate home and turn on the air conditioning.') },
    { taskCode: 'N10', group: 10, type: 'navigation', promptLines: task("You're meeting a friend for dinner.", "Tell the car to take you to Luigi's on 5th Avenue.") },
    { taskCode: 'C10', group: 10, type: 'cockpit', promptLines: task("You're about to merge onto the highway and the windows are down.", 'Tell the car to close everything up.') },
    { taskCode: 'M10', group: 10, type: 'media', promptLines: task('You want a mix of different songs instead of the same order.', 'Tell the car to shuffle your music.') },
    { taskCode: 'K10', group: 10, type: 'communication', promptLines: task('You promised to call your dad this evening.', 'Tell the car to call Dad.') },
  ],
];

// Group presentation order for a participant (1-based id), rotated by one group
// per participant. Returns the group numbers (1..10) in round order, e.g.
//   P1 -> [1,2,3,4,5,6,7,8,9,10]
//   P2 -> [2,3,4,5,6,7,8,9,10,1]
export function groupSequenceFor(participant: number): number[] {
  const offset = ((participant - 1) % NUM_GROUPS + NUM_GROUPS) % NUM_GROUPS;
  return Array.from({ length: NUM_GROUPS }, (_, k) => ((offset + k) % NUM_GROUPS) + 1);
}

export function tasksForGroup(group: number): VoiceTask[] {
  return GROUPS[group - 1];
}
