export function normaliseUmlauts(text: string): string {
  if (!text) return '';

  const umlautMap: Record<string, string> = {
    'Ä': 'AE', 'Ö': 'OE', 'Ü': 'UE',
    'ä': 'ae', 'ö': 'oe', 'ü': 'ue',
    'ß': 'ss'
  };

  let result = text;
  for (const [umlaut, replacement] of Object.entries(umlautMap)) {
    result = result.split(umlaut).join(replacement);
  }
  return result;
}

export function normalizeText(text: string): string {
  return text
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/EFT \/POS/g, 'EFT/POS')
    .trim();
}
