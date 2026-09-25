/** Shared lane / world constants */
export const LANE_WIDTH = 2.4;
export const LANE_X = [-LANE_WIDTH, 0, LANE_WIDTH];
export const GROUND_Y = 0;

/** Clickr brand — https://www.clickrmedia.com */
export const CLICKR = {
  orange: 0xff6900,
  accent: 0xcc5406,
  dark: 0x1b1b1a,
  footer: 0x262523,
  cream: 0xfbf5e8,
};

export const COLORS = {
  skin: 0xc68642,
  skinShadow: 0x8d5524,
  shirt: 0x6b3a1f,
  pants: 0x2c241c,
  boots: 0x1a120c,
  sash: 0xb84a1c,
  hair: 0x1c1008,
  stone: CLICKR.accent,
  stoneDark: CLICKR.dark,
  moss: 0x3a5a38,
  gold: 0xd4a017,
  torch: CLICKR.orange,
  fog: 0x0a080c,
  clickrOrange: CLICKR.orange,
  clickrAccent: CLICKR.accent,
  clickrDark: CLICKR.dark,
};

/** Story: Derick runs to his desk, dodging teammates */
export const RUNNER = "Derick";
/** Shout escalates with the dodge combo; highest tier with min <= combo wins. */
export const SHOUTS = [
  { min: 1, text: "Have you Claude it yet?" },
  { min: 3, text: "HAVE YOU CLAUDE IT YET?!" },
  { min: 5, text: "CLAUDE IT!!!" },
];
export const COMBO_WINDOW = 2.5; // seconds between shouts to keep the combo
export const FINAL_LINE = "Use the repo.";
export const FINISH_DISTANCE = 1500; // ~100s at current speed curve
export const TEAMMATES = [
  { name: "Hanyuan", line: "Bump on this please. Thanks.", reply: "Ok ok, Claude-ing now" },
  { name: "Seri", line: "Any updates on this?", reply: "Fine, asking Claude" },
  { name: "Waynn", line: "Walao so many calls today!", reply: "Walao ok lah, Claude it" },
  { name: "Nicholas", line: "Alamak...", reply: "Alamak... opening Claude" },
  { name: "Zin", line: "Let me get back to you on this", reply: "Getting back to you... via Claude" },
  { name: "Tara", line: "alamak ok jap ahhh", reply: "ok jap, Claude-ing ahhh" },
];
