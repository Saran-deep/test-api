// JSON-file persistence. Each collection is data/<name>.json shaped { "nextId": n, "items": [...] }.
// Files are re-read on every call, so you can hand-edit them while the server is running.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readFile(name) {
  return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
}

function writeFile(name, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const target = filePath(name);
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  try {
    fs.renameSync(tmp, target); // atomic replace, so a crash never leaves half a file
  } catch (e) {
    // Windows can refuse the rename while another program has the file open
    fs.writeFileSync(target, fs.readFileSync(tmp));
    fs.unlinkSync(tmp);
  }
}

class Collection {
  constructor(name) {
    this.name = name;
  }

  all() {
    return readFile(this.name).items;
  }

  find(predicate) {
    return this.all().find(predicate) || null;
  }

  filter(predicate) {
    return this.all().filter(predicate);
  }

  get(id) {
    return this.find((item) => item.id === id);
  }

  insert(fields) {
    const data = readFile(this.name);
    const record = { id: data.nextId++, ...fields };
    data.items.push(record);
    writeFile(this.name, data);
    return record;
  }

  update(id, changes) {
    const data = readFile(this.name);
    const index = data.items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    data.items[index] = { ...data.items[index], ...changes, id };
    writeFile(this.name, data);
    return data.items[index];
  }

  remove(id) {
    return this.removeWhere((item) => item.id === id) > 0;
  }

  removeWhere(predicate) {
    const data = readFile(this.name);
    const before = data.items.length;
    data.items = data.items.filter((item) => !predicate(item));
    if (data.items.length !== before) writeFile(this.name, data);
    return before - data.items.length;
  }
}

module.exports = {
  DATA_DIR,
  filePath,
  writeFile,
  users: new Collection('users'),
  books: new Collection('books'),
  loans: new Collection('loans'),
  sessions: new Collection('sessions'),
};
