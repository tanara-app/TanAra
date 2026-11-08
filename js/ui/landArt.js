/*
  The family land's art (img/land/, made with ChatGPT from the base land; see HOOSHVAREH.md):
  where each of the 80 pieces stands on the base land, in the base image's pixels (1448x1086).
  [x, y] is the bottom-centre of the piece, an optional third value an extra scale. Pieces of a
  plot open in their file order: <plot>-<sheet 1-4>-<piece 1-5>, smallest things first.
*/
export const LAND_W = 1448, LAND_H = 1086;
// how big each plot's pieces are drawn, against their file's width
export const SCALE = { garden: .30, farm: .30, forest: .34, lake: .34 };
// the width of each piece's file, in pixels
export const WIDTH = {
  'farm-1-1': 227, 'farm-1-2': 220, 'farm-1-3': 290, 'farm-1-4': 192, 'farm-1-5': 151, 'farm-2-1': 229,
  'farm-2-2': 315, 'farm-2-3': 267, 'farm-2-4': 280, 'farm-2-5': 235, 'farm-3-1': 219, 'farm-3-2': 430,
  'farm-3-3': 260, 'farm-3-4': 260, 'farm-3-5': 308, 'farm-4-1': 384, 'farm-4-2': 160, 'farm-4-3': 270,
  'farm-4-4': 290, 'farm-4-5': 145, 'forest-1-1': 134, 'forest-1-2': 200, 'forest-1-3': 210, 'forest-1-4': 180,
  'forest-1-5': 195, 'forest-2-1': 237, 'forest-2-2': 280, 'forest-2-3': 310, 'forest-2-4': 220, 'forest-2-5': 170,
  'forest-3-1': 179, 'forest-3-2': 373, 'forest-3-3': 440, 'forest-3-4': 220, 'forest-3-5': 170, 'forest-4-1': 320,
  'forest-4-2': 297, 'forest-4-3': 166, 'forest-4-4': 387, 'forest-4-5': 159, 'garden-1-1': 220, 'garden-1-2': 177,
  'garden-1-3': 167, 'garden-1-4': 176, 'garden-1-5': 160, 'garden-2-1': 322, 'garden-2-2': 256, 'garden-2-3': 350,
  'garden-2-4': 330, 'garden-2-5': 190, 'garden-3-1': 333, 'garden-3-2': 290, 'garden-3-3': 340, 'garden-3-4': 201,
  'garden-3-5': 175, 'garden-4-1': 338, 'garden-4-2': 239, 'garden-4-3': 340, 'garden-4-4': 220, 'garden-4-5': 432,
  'lake-1-1': 177, 'lake-1-2': 187, 'lake-1-3': 190, 'lake-1-4': 170, 'lake-1-5': 176, 'lake-2-1': 252,
  'lake-2-2': 226, 'lake-2-3': 171, 'lake-2-4': 289, 'lake-2-5': 142, 'lake-3-1': 214, 'lake-3-2': 390,
  'lake-3-3': 210, 'lake-3-4': 329, 'lake-3-5': 128, 'lake-4-1': 335, 'lake-4-2': 240, 'lake-4-3': 179,
  'lake-4-4': 329, 'lake-4-5': 271,
};
export const SPOT = {
  'garden-4-1': [440,230], 'garden-4-5': [268,242], 'garden-2-3': [612,240], 'garden-2-2': [348,236], 'garden-1-3': [532,234],
  'garden-3-2': [440,286], 'garden-2-1': [440,336], 'garden-1-2': [440,382], 'garden-3-1': [300,332], 'garden-3-5': [366,348],
  'garden-3-3': [586,338], 'garden-4-3': [252,290], 'garden-2-4': [600,286], 'garden-2-5': [512,300], 'garden-3-4': [304,266],
  'garden-1-1': [240,382], 'garden-4-2': [338,386], 'garden-1-5': [392,386], 'garden-1-4': [500,384], 'garden-4-4': [640,384],
  'farm-3-2': [852,242], 'farm-4-1': [1238,240], 'farm-2-2': [1010,238], 'farm-2-1': [1124,252], 'farm-3-5': [948,262],
  'farm-3-4': [816,302], 'farm-1-1': [912,304], 'farm-1-2': [994,296], 'farm-2-4': [1070,306], 'farm-4-4': [1176,300],
  'farm-3-3': [1262,312], 'farm-1-4': [802,350], 'farm-3-1': [872,362], 'farm-2-5': [936,382], 'farm-4-2': [1000,372],
  'farm-1-5': [1056,384], 'farm-1-3': [1124,350], 'farm-4-3': [1204,376], 'farm-2-3': [1272,390], 'farm-4-5': [784,390],
  'forest-2-2': [146,484], 'forest-3-2': [306,488], 'forest-1-3': [452,480], 'forest-4-1': [600,492], 'forest-2-4': [516,508],
  'forest-1-5': [398,506], 'forest-2-5': [222,508], 'forest-3-3': [200,594], 'forest-4-2': [372,592], 'forest-2-1': [556,594],
  'forest-4-4': [636,566,0.9], 'forest-3-5': [128,548], 'forest-4-5': [282,622], 'forest-3-1': [478,624], 'forest-1-2': [150,662],
  'forest-1-1': [208,668], 'forest-2-3': [310,664], 'forest-1-4': [424,666], 'forest-3-4': [560,666], 'forest-4-3': [644,666],
  'lake-3-2': [830,488], 'lake-4-5': [934,494], 'lake-4-1': [1092,490], 'lake-3-1': [1322,474], 'lake-1-3': [1206,504],
  'lake-1-2': [1032,528], 'lake-4-4': [858,564], 'lake-3-3': [940,566], 'lake-4-3': [1004,566], 'lake-4-2': [1252,566],
  'lake-2-3': [1046,578], 'lake-2-1': [1084,604], 'lake-2-2': [1156,614], 'lake-2-4': [992,628], 'lake-1-5': [1308,632],
  'lake-1-4': [800,662], 'lake-2-5': [1020,664], 'lake-1-1': [1062,670], 'lake-3-4': [1112,664], 'lake-3-5': [1216,662],
};
// each plot on the base land, with room above it for tall pieces: [x0, y0, x1, y1]
export const PLOT_BOX = { garden: [170, 120, 700, 410], farm: [740, 120, 1310, 410], forest: [70, 390, 710, 700], lake: [750, 390, 1385, 700] };
// where the name tag of each plot sits (its front fence)
export const TAG = { garden: [440, 402], farm: [1028, 402], forest: [400, 698], lake: [1066, 698] };
export const PLOT_NAME = { garden: 'باغ ایرانی', farm: 'مزرعه', forest: 'جنگل', lake: 'دریاچه' };
// the n-th piece (0-19) of a plot
export const pieceOrder = k => { const [, s, i] = k.split('-').map(Number); return (s - 1) * 5 + i - 1; };
