const sand_kf = [
  "⠁",
  "⠂",
  "⠄",
  "⡀",
  "⡈",
  "⡘",
  "⡰",
  "⣠",
  "⣡",
  "⣣",
  "⣦",
  "⣮",
  "⣾",
  "⣿",
  "⣶",
  "⣤",
  "⣀",
  " ",
];

export const getSandKeyFrame = () => {
  const totalMs = 1500;
  const time = new Date().getTime();
  const frame = Math.floor(((time % totalMs) * sand_kf.length) / 1500);
  return sand_kf[frame] ?? " ";
};
