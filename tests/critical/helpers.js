export class MemoryStorage {
  constructor(entries = []) {
    this.map = new Map(entries);
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return [...this.map.keys()][index] || null;
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(key);
  }
}
