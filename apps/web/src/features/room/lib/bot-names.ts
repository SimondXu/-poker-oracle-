// Seat-stable display names for bots. Personality (Fish/TAG/LAG) is shown separately as a stamp,
// so the name stays a person-like handle instead of "TAG Bot 3".
const BOT_NAMES = ['Marlow', 'Nadia', 'Viper', 'Gus', 'Rook', 'Iris', 'Hale', 'Juno', 'Dex', 'Wren'] as const;

export function getBotDisplayName(seatIndex: number): string {
  const index = ((seatIndex % BOT_NAMES.length) + BOT_NAMES.length) % BOT_NAMES.length;
  return BOT_NAMES[index] ?? 'Bot';
}
