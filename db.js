import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';

let db;
let dbQueue = Promise.resolve();

const queueQuery = (fn) => {
  return new Promise((resolve, reject) => {
    dbQueue = dbQueue.then(async () => {
      try {
        const res = await fn();
        resolve(res);
      } catch (err) {
        reject(err);
      }
    }).catch(() => {});
  });
};

export const initDB = async () => {
  db = await SQLite.openDatabaseAsync('vault.db');
  await db.execAsync('CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT, file_path TEXT, tags TEXT, size INTEGER, created_at TEXT, local_uri TEXT, file_hash TEXT, is_favorite INTEGER DEFAULT 0)');
  await db.execAsync('ALTER TABLE items ADD COLUMN size INTEGER DEFAULT 0').catch(() => {});
  await db.execAsync('ALTER TABLE items ADD COLUMN local_uri TEXT').catch(() => {});
  await db.execAsync('ALTER TABLE items ADD COLUMN file_hash TEXT').catch(() => {});
  await db.execAsync('ALTER TABLE items ADD COLUMN is_favorite INTEGER DEFAULT 0').catch(() => {});
  // Migrate existing items that don't have local_uri yet
  await db.execAsync('UPDATE items SET local_uri = file_path WHERE local_uri IS NULL AND file_path IS NOT NULL').catch(() => {});
  await db.execAsync('CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)');
  return db;
};

export const addItem = (name, type, local_uri, tags, size, file_hash) => {
  return queueQuery(() =>
    db.runAsync(
      'INSERT INTO items (name, type, file_path, local_uri, tags, size, file_hash, created_at) VALUES (?,?,?,?,?,?,?,?)',
      [name, type, local_uri, local_uri, tags, size || 0, file_hash || null, new Date().toISOString()]
    )
  );
};

export const getItems = (query = '') => {
  return queueQuery(() => {
    if (!query) return db.getAllAsync('SELECT * FROM items ORDER BY created_at DESC');
    return db.getAllAsync(
      'SELECT * FROM items WHERE name LIKE ? OR tags LIKE ? ORDER BY created_at DESC',
      [`%${query}%`, `%${query}%`]
    );
  });
};

export const renameItem = (id, newName) => {
  return queueQuery(() =>
    db.runAsync('UPDATE items SET name=?, tags=? WHERE id=?', [newName, newName, id])
  );
};

export const deleteItem = (id) => {
  return queueQuery(async () => {
    // Find the item details
    const item = await db.getFirstAsync('SELECT local_uri, file_hash FROM items WHERE id = ?', [id]);
    if (item && item.local_uri) {
      // Check if other database records reference the same physical file
      const others = await db.getAllAsync('SELECT id FROM items WHERE local_uri = ? AND id != ?', [item.local_uri, id]);
      if (others.length === 0) {
        // No other records reference this file, safe to delete physically
        await FileSystem.deleteAsync(item.local_uri, { idempotent: true }).catch(() => {});
      }
    }
    await db.runAsync('DELETE FROM items WHERE id=?', [id]);
  });
};

export const getLocalUriByHash = (hash) => {
  return queueQuery(async () => {
    if (!hash) return null;
    const row = await db.getFirstAsync('SELECT local_uri FROM items WHERE file_hash = ?', [hash]);
    return row ? row.local_uri : null;
  });
};

export const getDB = () => db;

// --- Settings (auth) helpers ---
export const getSetting = (key) => {
  return queueQuery(async () => {
    const row = await db.getFirstAsync('SELECT value FROM settings WHERE key=?', [key]);
    return row ? row.value : null;
  });
};

export const setSetting = (key, value) => {
  return queueQuery(async () => {
    await db.runAsync('DELETE FROM settings WHERE key=?', [key]);
    return db.runAsync('INSERT INTO settings (key, value) VALUES (?,?)', [key, value]);
  });
};

export const toggleFavorite = (id, currentVal) => {
  return queueQuery(() =>
    db.runAsync('UPDATE items SET is_favorite=? WHERE id=?', [currentVal ? 0 : 1, id])
  );
};