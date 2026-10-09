import { bakeWordmark } from './wordmarkPixels';

addEventListener('message', async (event: MessageEvent<[string, string]>) => {
  const pixels = await bakeWordmark(...event.data);
  const arrays = pixels.letters.flatMap((letter) => [
    letter.positions,
    letter.colors,
    letter.cells,
    letter.grid,
    letter.drops,
    letter.digits,
    letter.sites,
  ]);
  postMessage(pixels, { transfer: [...arrays, pixels.sources].map((array) => array.buffer) });
});
