/**
 * DataMesh - A hybrid data structure combining Array, Map, and Set capabilities
 * with O(1) lookups, instant indexing, and reactive updates.
 * 
 * @class DataMesh
 * @template T - The type of items stored in the DataMesh
 */

// Private symbols for encapsulation
const _data = Symbol('data');
const _id = Symbol('idField');
const _map = Symbol('mapById');
const _idx = Symbol('indexes');
const _subs = Symbol('subscribers');
const _batchDepth = Symbol('batchDepth');
const _queued = Symbol('queuedEvents');
const _isDestroyed = Symbol('isDestroyed');

class DataMesh {
  /**
   * Creates a new DataMesh instance
   * @param {string} primaryKey - The field name to use as the unique identifier
   * @param {string[]} indexedFields - Array of field names to create indexes for
   * @param {T[]} initialData - Optional initial data to populate the DataMesh
   */
  constructor(primaryKey, indexedFields = [], initialData = []) {
    if (typeof primaryKey !== 'string' || !primaryKey) {
      throw new Error('Primary key must be a non-empty string');
    }
    
    this[_id] = primaryKey;
    this[_data] = [];
    this[_map] = new Map();
    this[_idx] = new Map(); // field -> Map(value -> Set(items))
    this[_subs] = new Set();
    this[_batchDepth] = 0;
    this[_queued] = [];
    this[_isDestroyed] = false;

    // Initialize indexes
    indexedFields.forEach(field => {
      if (typeof field !== 'string') {
        throw new Error('Indexed fields must be strings');
      }
      this._ensureIndex(field);
    });

    // Add initial data
    if (initialData.length > 0) {
      this.addMany(initialData);
    }

    // Return a Proxy for native-like behavior
    return new Proxy(this, _meshProxyHandler);
  }

  // ---- Basic properties ----
  get length() { return this[_data].length; }
  get primaryKey() { return this[_id]; }
  get indexedFields() { return Array.from(this[_idx].keys()); }

  // ---- Iteration & array-like access ----
  [Symbol.iterator]() { return this[_data][Symbol.iterator](); }
  
  /**
   * Returns a shallow copy of the data array
   * @returns {T[]} Array of all items
   */
  toArray() { return this[_data].slice(); }

  /**
   * Gets item at specific index (supports negative indices)
   * @param {number} i - Index (can be negative)
   * @returns {T|undefined} Item at index or undefined
   */
  at(i) {
    const n = this.length;
    const idx = i < 0 ? n + i : i;
    return (idx >= 0 && idx < n) ? this[_data][idx] : undefined;
  }

  // ---- Index management ----
  _ensureIndex(field) {
    if (!this[_idx].has(field)) {
      this[_idx].set(field, new Map());
    }
  }

  /**
   * Adds an index for a field and builds it from existing data
   * @param {string} field - Field name to index
   * @returns {DataMesh} This instance for chaining
   */
  addIndex(field) {
    if (typeof field !== 'string') {
      throw new Error('Field must be a string');
    }
    
    this._ensureIndex(field);
    // Build from existing data
    const map = this[_idx].get(field);
    map.clear();
    for (const item of this[_data]) {
      const v = item[field];
      let set = map.get(v);
      if (!set) map.set(v, (set = new Set()));
      set.add(item);
    }
    return this;
  }

  // ---- CRUD Operations ----
  /**
   * Adds a single item to the DataMesh
   * @param {T} item - The item to add
   * @returns {DataMesh} This instance for chaining
   */
  add(item) {
    if (this[_isDestroyed]) {
      throw new Error('DataMesh has been destroyed');
    }

    if (item == null || typeof item !== 'object') {
      throw new Error('Only objects/records can be added');
    }

    const pk = this[_id];
    if (!(pk in item)) {
      throw new Error(`Missing primary key: ${pk}`);
    }

    const key = item[pk];
    if (this[_map].has(key)) {
      throw new Error(`Duplicate primary key: ${key}`);
    }

    this[_data].push(item);
    this[_map].set(key, item);
    
    // Update indexes
    for (const [field, map] of this[_idx]) {
      const v = item[field];
      let set = map.get(v);
      if (!set) map.set(v, (set = new Set()));
      set.add(item);
    }

    this._emit({ type: 'add', items: [item] });
    return this;
  }

  /**
   * Adds or updates an item (insert if not exists, update if exists)
   * @param {T} item - The item to upsert
   * @returns {DataMesh} This instance for chaining
   */
  upsert(item) {
    if (this[_isDestroyed]) {
      throw new Error('DataMesh has been destroyed');
    }

    const pk = this[_id];
    if (!(pk in item)) {
      throw new Error(`Missing primary key: ${pk}`);
    }

    const key = item[pk];
    if (!this[_map].has(key)) {
      return this.add(item);
    } else {
      // Mutate existing object to preserve identity for live views
      const existing = this[_map].get(key);
      
      // Update indexes for fields that change
      for (const [field, map] of this[_idx]) {
        const oldV = existing[field];
        const newV = item[field];
        if (oldV !== newV) {
          const oldSet = map.get(oldV);
          if (oldSet) {
            oldSet.delete(existing);
            if (oldSet.size === 0) map.delete(oldV);
          }
          let newSet = map.get(newV);
          if (!newSet) map.set(newV, (newSet = new Set()));
          newSet.add(existing);
        }
      }
      
      Object.assign(existing, item);
      this._emit({ type: 'update', items: [existing] });
      return this;
    }
  }

  /**
   * Adds multiple items to the DataMesh
   * @param {T[]} items - Array of items to add
   * @returns {number} Number of items successfully added
   */
  addMany(items) {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }

    let addedCount = 0;
    for (const item of items) {
      try {
        this.add(item);
        addedCount++;
      } catch (error) {
        console.warn(`Failed to add item:`, error.message);
      }
    }
    return addedCount;
  }

  /**
   * Updates an existing item by its primary key
   * @param {any} id - The primary key value
   * @param {Partial<T>} patch - The new data to merge
   * @returns {boolean} True if updated successfully
   */
  update(id, patch) {
    if (this[_isDestroyed]) {
      throw new Error('DataMesh has been destroyed');
    }

    if (patch === null || typeof patch !== 'object') {
      throw new Error('Patch must be a non-null object');
    }

    const item = this[_map].get(id);
    if (!item) {
      return false;
    }

    // Update indexes first (we need old and new values)
    for (const [field, map] of this[_idx]) {
      if (field in patch) {
        const oldV = item[field];
        const newV = patch[field];
        if (oldV !== newV) {
          const oldSet = map.get(oldV);
          if (oldSet) {
            oldSet.delete(item);
            if (oldSet.size === 0) map.delete(oldV);
          }
          let newSet = map.get(newV);
          if (!newSet) map.set(newV, (newSet = new Set()));
          newSet.add(item);
        }
      }
    }

    Object.assign(item, patch);
    this._emit({ type: 'update', items: [item] });
    return true;
  }

  /**
   * Removes an item by its primary key
   * @param {any} id - The primary key value
   * @returns {boolean} True if removed successfully
   */
  removeById(id) {
    if (this[_isDestroyed]) {
      throw new Error('DataMesh has been destroyed');
    }

    const item = this[_map].get(id);
    if (!item) {
      return false;
    }

    this[_map].delete(id);
    
    // Remove from order array (O(n), but keeps behavior simple)
    const idx = this[_data].indexOf(item);
    if (idx !== -1) this[_data].splice(idx, 1);

    // Remove from indexes
    for (const [field, map] of this[_idx]) {
      const v = item[field];
      const set = map.get(v);
      if (set) {
        set.delete(item);
        if (set.size === 0) map.delete(v);
      }
    }

    this._emit({ type: 'remove', items: [item] });
    return true;
  }

  /**
   * Clears all data from the DataMesh
   */
  clear() {
    const removed = this[_data].slice();
    this[_data].length = 0;
    this[_map].clear();
    for (const [, map] of this[_idx]) map.clear();
    
    if (removed.length) {
      this._emit({ type: 'clear', items: removed });
    }
  }

  // ---- Query Methods ----
  /**
   * Checks if an item exists by primary key
   * @param {any} id - The primary key value
   * @returns {boolean} True if item exists
   */
  has(id) { return this[_map].has(id); }

  /**
   * Gets an item by its primary key
   * @param {any} id - The primary key value
   * @returns {T|undefined} The item or undefined if not found
   */
  getById(id) { return this[_map].get(id); }

  /**
   * Gets all items that match a specific field value
   * @param {string} field - The field name to search
   * @param {any} value - The value to match
   * @returns {T[]} Array of matching items
   */
  getByIndex(field, value) {
    const map = this[_idx].get(field);
    if (!map) {
      throw new Error(`No index for field: ${field}`);
    }
    const set = map.get(value);
    return set ? Array.from(set) : [];
  }

  // ---- Array-like Methods ----
  /**
   * Maps items using a transform function
   * @param {Function} fn - Function to transform each item
   * @param {any} thisArg - Value to use as 'this' when executing fn
   * @returns {any[]} Array of transformed values
   */
  map(fn, thisArg) { return this[_data].map(fn, thisArg); }

  /**
   * Executes a function for each item
   * @param {Function} fn - Function to execute for each item
   * @param {any} thisArg - Value to use as 'this' when executing fn
   */
  forEach(fn, thisArg) { this[_data].forEach(fn, thisArg); }

  /**
   * Checks if any item matches the predicate
   * @param {Function} fn - Function to test each item
   * @param {any} thisArg - Value to use as 'this' when executing fn
   * @returns {boolean} True if any item matches
   */
  some(fn, thisArg) { return this[_data].some(fn, thisArg); }

  /**
   * Checks if all items match the predicate
   * @param {Function} fn - Function to test each item
   * @param {any} thisArg - Value to use as 'this' when executing fn
   * @returns {boolean} True if all items match
   */
  every(fn, thisArg) { return this[_data].every(fn, thisArg); }

  /**
   * Reduces items using a reducer function
   * @param {Function} fn - Function to reduce items
   * @param {any} init - Initial value for reduction
   * @returns {any} The reduced value
   */
  reduce(fn, init) { return this[_data].reduce(fn, init); }

  /**
   * Filters items using a predicate function
   * @param {Function} fn - Function to test each item
   * @param {any} thisArg - Value to use as 'this' when executing fn
   * @returns {DataMesh<T>} A new DataMesh containing filtered items
   */
  filter(fn, thisArg) {
    const child = new DataMesh(this[_id], this.indexedFields);
    for (const it of this[_data]) {
      if (fn.call(thisArg ?? null, it)) {
        child.add(it);
      }
    }
    return child;
  }

  /**
   * Finds the first item that matches the predicate
   * @param {Function} fn - Function to test each item
   * @param {any} thisArg - Value to use as 'this' when executing fn
   * @returns {T|undefined} The first matching item or undefined
   */
  find(fn, thisArg) { return this[_data].find(fn, thisArg); }

  /**
   * Creates a live subset filtered by a specific field value
   * @param {string} field - The field name to filter by
   * @param {any} value - The value to match
   * @returns {MeshView<T>} A live view containing the filtered subset
   */
  where(field, value) {
    // Live view (auto-updating)
    return new MeshView(this, (item) => item[field] === value);
  }

  // ---- Advanced Methods ----
  /**
   * Gets all unique values for a specific field
   * @param {string} field - The field name
   * @returns {any[]} Array of unique values
   */
  getUniqueValues(field) {
    if (this[_idx].has(field)) {
      return Array.from(this[_idx].get(field).keys());
    }
    return [...new Set(this[_data].map(item => item[field]))];
  }

  /**
   * Gets statistics for a numeric field
   * @param {string} field - The field name
   * @returns {Object} Statistics object with min, max, avg, sum, count
   */
  getStats(field) {
    const values = this[_data]
      .map(item => item[field])
      .filter(val => typeof val === 'number' && !isNaN(val));

    if (values.length === 0) {
      return { min: null, max: null, avg: null, sum: 0, count: 0 };
    }

    const sum = values.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      sum,
      count: values.length
    };
  }

  /**
   * Sorts the DataMesh by a field
   * @param {string} field - The field to sort by
   * @param {boolean} ascending - Sort order (default: true)
   * @returns {DataMesh<T>} A new sorted DataMesh
   */
  sortBy(field, ascending = true) {
    const sorted = new DataMesh(this[_id], this.indexedFields);
    const sortedData = [...this[_data]].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      
      if (aVal < bVal) return ascending ? -1 : 1;
      if (aVal > bVal) return ascending ? 1 : -1;
      return 0;
    });
    
    sorted.addMany(sortedData);
    return sorted;
  }

  /**
   * Groups items by a field
   * @param {string} field - The field to group by
   * @returns {Map<any, T[]>} Map of grouped items
   */
  groupBy(field) {
    const groups = new Map();
    this[_data].forEach(item => {
      const key = item[field];
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(item);
    });
    return groups;
  }

  // ---- Utility Methods ----
  /**
   * Gets the size of the DataMesh
   * @returns {number} Number of items
   */
  size() { return this[_data].length; }

  /**
   * Checks if the DataMesh is empty
   * @returns {boolean} True if empty
   */
  isEmpty() { return this[_data].length === 0; }

  /**
   * Returns all items as a Map
   * @returns {Map<any, T>} Map of items keyed by primary key
   */
  toMap() { return new Map(this[_map]); }

  /**
   * Returns all items as a Set
   * @returns {Set<T>} Set of all items
   */
  toSet() { return new Set(this[_data]); }

  /**
   * Serializes the DataMesh to JSON
   * @returns {T[]} Array representation
   */
  toJSON() { return this.toArray(); }

  // ---- Reactive System ----
  /**
   * Subscribes to DataMesh changes
   * @param {Function} listener - Callback function to execute on changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    this[_subs].add(listener);
    return () => this[_subs].delete(listener);
  }

  /**
   * Executes operations in batch mode to reduce event emissions
   * @param {Function} fn - Function containing operations to batch
   */
  batch(fn) {
    if (typeof fn !== 'function') {
      throw new Error('Batch function must be a function');
    }
    this[_batchDepth]++;
    try {
      fn();
    } finally {
      this[_batchDepth]--;
      if (this[_batchDepth] === 0 && this[_queued].length) {
        const events = this[_queued].splice(0, this[_queued].length);
        this._reallyEmit({ type: 'batch', events });
      }
    }
  }

  _emit(evt) {
    if (this[_batchDepth] > 0) {
      this[_queued].push(evt);
    } else {
      this._reallyEmit(evt);
    }
  }

  _reallyEmit(evt) {
    for (const cb of this[_subs]) {
      try {
        cb(evt, this);
      } catch (error) {
        console.error('Error in DataMesh subscriber:', error);
      }
    }
  }

  // ---- "by" helper (users.by.age(25)) ----
  get by() {
    const self = this;
    return new Proxy({}, {
      get(_, field) {
        if (!self[_idx].has(field)) {
          throw new Error(`No index for field: ${String(field)}`);
        }
        return (value) => self.getByIndex(String(field), value);
      }
    });
  }

  /**
   * Destroys the DataMesh and cleans up resources
   */
  destroy() {
    this[_isDestroyed] = true;
    this[_subs].clear();
    // Don't call clear() here as it would throw an error
    this[_data].length = 0;
    this[_map].clear();
    for (const [, map] of this[_idx]) map.clear();
  }
}

// Proxy handler for native-like behavior
const _meshProxyHandler = {
  get(target, prop, receiver) {
    // Numeric index access: mesh[0], mesh[-1]
    if (typeof prop === 'string' && /^-?[0-9]+$/.test(prop)) {
      return target.at(Number(prop));
    }
    
    // Callable primary key accessor: mesh.id(123)
    if (prop === target.primaryKey) {
      return (id) => target.getById(id);
    }
    
    // Everything else: bind functions correctly
    const value = Reflect.get(target, prop, receiver);
    return typeof value === 'function' ? value.bind(target) : value;
  },
  
  has(target, prop) {
    if (typeof prop === 'string' && /^-?[0-9]+$/.test(prop)) {
      const i = Number(prop);
      const n = target.length;
      const idx = i < 0 ? n + i : i;
      return idx >= 0 && idx < n;
    }
    return prop in target;
  },
  
  ownKeys(target) {
    // Enumerate like an array plus object keys
    const keys = [];
    for (let i = 0; i < target.length; i++) keys.push(String(i));
    return keys.concat(Reflect.ownKeys(target));
  },
  
  getOwnPropertyDescriptor(target, prop) {
    if (typeof prop === 'string' && /^-?[0-9]+$/.test(prop)) {
      return { 
        configurable: true, 
        enumerable: true, 
        writable: false, 
        value: target.at(Number(prop)) 
      };
    }
    return Object.getOwnPropertyDescriptor(target, prop) ||
           { configurable: true, enumerable: false, writable: true, value: target[prop] };
  }
};

// ---- Live View (auto-updating subset) ----
class MeshView {
  constructor(mesh, predicate) {
    this.mesh = mesh;
    this._pred = predicate;
    this._items = [];
    this._set = new Set();
    
    // Initialize with current data
    for (const it of mesh) this._maybeAdd(it);

    // Subscribe to changes
    this._unsub = mesh.subscribe((evt) => {
      switch (evt.type) {
        case 'add':
          for (const it of evt.items) this._maybeAdd(it);
          break;
        case 'update':
          for (const it of evt.items) {
            const inNow = this._pred(it);
            const wasIn = this._set.has(it);
            if (inNow && !wasIn) this._add(it);
            else if (!inNow && wasIn) this._remove(it);
          }
          break;
        case 'remove':
          for (const it of evt.items) this._remove(it);
          break;
        case 'clear':
          this._items.length = 0;
          this._set.clear();
          break;
        case 'batch':
          for (const e of evt.events) this._meshApply(e);
          break;
      }
    });

    // Return proxy for array-like behavior
    return new Proxy(this, {
      get: (t, p) => {
        if (p === 'length') return t._items.length;
        if (p === Symbol.iterator) return t._items[Symbol.iterator].bind(t._items);
        if (typeof p === 'string' && /^-?[0-9]+$/.test(p)) return t._items[Number(p)];
        if (p in t) return typeof t[p] === 'function' ? t[p].bind(t) : t[p];
        if (p in t._items) {
          const v = t._items[p];
          return typeof v === 'function' ? v.bind(t._items) : v;
        }
      },
      has: (t, p) => {
        if (typeof p === 'string' && /^-?[0-9]+$/.test(p)) {
          const i = Number(p);
          const n = t._items.length;
          const idx = i < 0 ? n + i : i;
          return idx >= 0 && idx < n;
        }
        return (p in t || p in t._items);
      },
      ownKeys: (t) => Array.from({ length: t._items.length }, (_, i) => String(i)).concat(Reflect.ownKeys(t)),
              getOwnPropertyDescriptor: (t, p) => (typeof p === 'string' && /^-?[0-9]+$/.test(p))
          ? { configurable: true, enumerable: true, value: t._items[Number(p)] }
          : Object.getOwnPropertyDescriptor(t, p),
    });
  }

  _meshApply(evt) {
    // Used for batched events
    if (evt.type === 'add' || evt.type === 'update' || evt.type === 'remove' || evt.type === 'clear') {
      // Defer to the normal handler by faking single events
      this.mesh._reallyEmit(evt); // No-op here; kept for structure
    }
  }

  _maybeAdd(it) { 
    if (this._pred(it)) this._add(it); 
  }

  _add(it) { 
    if (!this._set.has(it)) { 
      this._set.add(it); 
      this._items.push(it); 
    } 
  }

  _remove(it) {
    if (this._set.delete(it)) {
      const i = this._items.indexOf(it);
      if (i !== -1) this._items.splice(i, 1);
    }
  }

  /**
   * Disposes the view and unsubscribes from changes
   */
  dispose() { 
    if (this._unsub) this._unsub(); 
  }

  /**
   * Returns a copy of the current items
   * @returns {any[]} Array of items
   */
  toArray() { 
    return this._items.slice(); 
  }
}

module.exports = DataMesh;
  