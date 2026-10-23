// Independent SPH adapter. Reports use hexadecimal colors; common CSS rgb() is also supported.
export class RGBColor {
  constructor(value) {
    const text = String(value).trim().toLowerCase();
    const named = { black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff' };
    let hex = named[text] || text;
    const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/.exec(text);
    if (rgb && rgb.slice(1).every(n => Number(n) <= 255)) hex = '#' + rgb.slice(1).map(n => Number(n).toString(16).padStart(2, '0')).join('');
    this.ok = /^#[0-9a-f]{6}$/.test(hex);
    this.hex = hex;
  }
  toHex() { return this.hex; }
}
