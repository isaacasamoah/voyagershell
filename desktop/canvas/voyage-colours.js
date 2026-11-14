export function voyageColour(index) {
  const palette = [
    "#ff5f56",
    "#f7a34b",
    "#f4e04d",
    "#5ec98f",
    "#59a5ff",
    "#b07af5",
  ];
  const base = palette[index % palette.length];
  const cycle = Math.floor(index / palette.length);
  if (!cycle) return base;
  return `#${((parseInt(base.slice(1), 16) + cycle * 0x091307) & 0xffffff).toString(16).padStart(6, "0")}`;
}
