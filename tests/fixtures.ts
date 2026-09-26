// Real response sample from docs/SITE-MAP.md §1.
export const COMMENTARY_RESPONSE = {
  status: 'ready',
  classificationStatus: 'settled',
  classificationGeneration: 2,
  commentary: {
    _id: 'vh77',
    gameId: 'exampleGameId000000000000000000',
    plyIndex: 2,
    positionId: 'exampleGameId000000000000000000:2',
    text: 'White immediately challenges the center with d4, leading into …',
    content: [
      {
        type: 'paragraph',
        children: [
          { type: 'player', player: 'white' },
          { text: ' immediately challenges the center with ' },
          { type: 'san', san: 'd4', color: 'white' },
          { text: ', leading into the sharp lines of the Center Game. By attacking the e5 pawn, ' },
          { type: 'player', player: 'white' },
          { text: ' forces ' },
          { type: 'player', player: 'black' },
          { text: ' to decide how to resolve the tension in the heart of the board.' },
        ],
      },
    ],
  },
};
