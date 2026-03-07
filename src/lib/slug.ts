// lib/slug.ts — adjective-noun-number slug generator

const adjectives = [
  'dark', 'shadow', 'ancient', 'cursed', 'frozen', 'burning', 'hidden',
  'crystal', 'iron', 'golden', 'silver', 'crimson', 'emerald', 'obsidian',
  'silent', 'stormy', 'misty', 'haunted', 'mystic', 'twisted', 'broken',
  'sacred', 'fallen', 'hollow', 'savage', 'spectral', 'arcane', 'runic',
  'verdant', 'ashen', 'thunder', 'lunar', 'solar', 'deep', 'wild',
];

const nouns = [
  'forest', 'dungeon', 'castle', 'cavern', 'temple', 'tower', 'crypt',
  'marsh', 'peak', 'vale', 'keep', 'forge', 'sanctum', 'lair',
  'throne', 'vault', 'ruins', 'bridge', 'gate', 'tomb', 'maze',
  'haven', 'spire', 'chasm', 'grove', 'altar', 'bastion', 'citadel',
  'den', 'harbor', 'nexus', 'oasis', 'prison', 'reef', 'shrine',
];

function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateSlug(): string {
  const adj = randomItem(adjectives);
  const noun = randomItem(nouns);
  const num = Math.floor(Math.random() * 99) + 1;
  return `${adj}-${noun}-${num}`;
}
