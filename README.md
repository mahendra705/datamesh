# DataMesh 🚀

> **A hybrid data structure combining Array, Map, and Set capabilities with O(1) lookups, instant indexing, and reactive updates.**

DataMesh solves common data management problems by providing a single, efficient structure that eliminates the need for multiple data structures and expensive operations.

## ✨ Features

- **🔍 O(1) Primary Key Lookups** - Instant access by unique identifier
- **📊 Multi-Field Indexing** - Fast searches across multiple fields
- **📝 Array-like Operations** - Native array methods (map, filter, reduce, etc.)
- **🔄 Reactive Updates** - Automatic synchronization across views
- **⚡ Performance Optimized** - No duplicate data, efficient memory usage
- **🔗 Live Subsets** - Create filtered views that stay in sync
- **📦 Zero Dependencies** - Lightweight and framework-agnostic
- **🛡️ Type Safe** - Full JSDoc documentation with TypeScript-like types

## 🚀 Quick Start

### Installation

```bash
npm install @mahendra705/datamesh
```

### Basic Usage

```javascript
const DataMesh = require('@mahendra705/datamesh');

// Create a DataMesh for users with indexes on 'name' and 'age'
const users = new DataMesh('id', ['name', 'age']);

// Add data
users.add({ id: 1, name: 'Alice', age: 25 });
users.add({ id: 2, name: 'Bob', age: 30 });
users.add({ id: 3, name: 'Charlie', age: 25 });

// O(1) access by ID
console.log(users.getById(2)); 
// → { id: 2, name: 'Bob', age: 30 }

// Instant filter by indexed field
console.log(users.getByIndex('age', 25));
// → [ { id: 1, name: 'Alice', age: 25 }, { id: 3, name: 'Charlie', age: 25 } ]

// Array-like iteration
users.forEach(user => console.log(user.name));
// → Alice, Bob, Charlie

// Chainable operations
const names = users.filter(u => u.age > 25).map(u => u.name);
console.log(names); // → [ 'Bob' ]
```

## 📚 API Reference

### Constructor

```javascript
new DataMesh(primaryKey, indexedFields = [], initialData = [])
```

- `primaryKey` (string): Field name to use as unique identifier
- `indexedFields` (string[]): Array of field names to create indexes for
- `initialData` (array): Optional initial data to populate

### Core Methods

#### Data Management

```javascript
// Add single item
users.add({ id: 4, name: 'David', age: 28 });

// Add multiple items
users.addMany([
  { id: 5, name: 'Eve', age: 22 },
  { id: 6, name: 'Frank', age: 35 }
]);

// Update existing item
users.update(1, { age: 26 });

// Remove item
users.removeById(3);

// Clear all data
users.clear();
```

#### Retrieval Methods

```javascript
// Get by primary key (O(1))
const user = users.getById(1);

// Get by indexed field (O(1))
const age25Users = users.getByIndex('age', 25);

// Check if item exists
const exists = users.has(1);

// Get size
const count = users.size();

// Check if empty
const isEmpty = users.isEmpty();
```

#### Array-like Methods

```javascript
// Filter
const adults = users.filter(u => u.age >= 18);

// Map
const names = users.map(u => u.name);

// Reduce
const totalAge = users.reduce((sum, u) => sum + u.age, 0);

// Find
const alice = users.find(u => u.name === 'Alice');

// Some
const hasTeenager = users.some(u => u.age < 20);

// Every
const allAdults = users.every(u => u.age >= 18);

// ForEach
users.forEach(u => console.log(u.name));
```

#### Advanced Features

```javascript
// Create live subset
const youngUsers = users.where('age', 25);

// Get unique values
const ages = users.getUniqueValues('age');

// Get statistics for numeric fields
const ageStats = users.getStats('age');
// → { min: 22, max: 35, avg: 27.5, sum: 165, count: 6 }

// Sort by field
const sortedByAge = users.sortBy('age', true); // ascending

// Group by field
const ageGroups = users.groupBy('age');

// Convert to different formats
const userArray = users.toArray();
const userMap = users.toMap();
const userSet = users.toSet();
```

#### Reactive Updates

```javascript
// Subscribe to changes
const unsubscribe = users.subscribe(event => {
  console.log('DataMesh changed:', event.type, event.items);
});

// Batch operations (reduces event emissions)
users.batch(() => {
  users.add({ id: 7, name: 'Grace', age: 29 });
  users.add({ id: 8, name: 'Henry', age: 31 });
  users.update(1, { age: 27 });
});

// Clean up
unsubscribe();
users.destroy();
```

## 🎯 Use Cases

### 1. **E-commerce Product Catalog**

```javascript
const products = new DataMesh('sku', ['category', 'brand', 'price']);

products.addMany([
  { sku: 'P001', name: 'Laptop', category: 'electronics', brand: 'Apple', price: 1200 },
  { sku: 'P002', name: 'Phone', category: 'electronics', brand: 'Samsung', price: 800 },
  { sku: 'P003', name: 'Book', category: 'books', brand: 'Penguin', price: 20 }
]);

// Fast category filtering
const electronics = products.getByIndex('category', 'electronics');

// Price range filtering
const expensive = products.filter(p => p.price > 1000);

// Brand search
const appleProducts = products.getByIndex('brand', 'Apple');
```

### 2. **Real-time Chat Application**

```javascript
const messages = new DataMesh('id', ['roomId', 'userId', 'timestamp']);

// Live room view
const roomMessages = messages.where('roomId', 'room-123');

// User's messages
const userMessages = messages.where('userId', 'user-456');

// Recent messages
const recent = messages.filter(m => 
  Date.now() - m.timestamp < 60000
);
```

### 3. **Task Management System**

```javascript
const tasks = new DataMesh('id', ['status', 'priority', 'assignee']);

// Active tasks
const active = tasks.where('status', 'active');

// High priority tasks
const urgent = tasks.filter(t => t.priority === 'high');

// User's tasks
const myTasks = tasks.where('assignee', 'current-user');

// Task statistics
const statusStats = tasks.getStats('priority');
```

## ⚡ Performance Benefits

### Before DataMesh (Traditional Approach)

```javascript
// Multiple data structures needed
const users = [];
const userMap = new Map();
const ageIndex = new Map();

// Expensive operations
function findUser(id) {
  return users.find(u => u.id === id); // O(n)
}

function findUsersByAge(age) {
  return users.filter(u => u.age === age); // O(n)
}

// Manual synchronization required
function addUser(user) {
  users.push(user);
  userMap.set(user.id, user);
  if (!ageIndex.has(user.age)) ageIndex.set(user.age, []);
  ageIndex.get(user.age).push(user);
}
```

### After DataMesh

```javascript
const users = new DataMesh('id', ['age']);

// O(1) operations
const user = users.getById(id);
const ageUsers = users.getByIndex('age', 25);

// Automatic synchronization
users.add(user); // Updates all indexes automatically
```

## 🔧 Advanced Examples

### Custom Indexing Strategy

```javascript
class ProductMesh extends DataMesh {
  constructor() {
    super('id', ['category', 'brand', 'price']);
  }

  // Custom method for price range queries
  getByPriceRange(min, max) {
    return this.filter(p => p.price >= min && p.price <= max);
  }

  // Custom method for search
  search(query) {
    const lowerQuery = query.toLowerCase();
    return this.filter(p => 
      p.name.toLowerCase().includes(lowerQuery) ||
      p.description.toLowerCase().includes(lowerQuery)
    );
  }
}
```

### Reactive UI Integration

```javascript
const users = new DataMesh('id', ['status']);

// React-like reactive updates
const activeUsers = users.where('status', 'active');

users.subscribe(event => {
  if (event.type === 'add') {
    console.log('New users added:', event.items);
  } else if (event.type === 'update') {
    console.log('Users updated:', event.items);
  }
});

// activeUsers automatically stays in sync
```

## 📦 Installation & Setup

### Node.js

```bash
npm install @mahendra705/datamesh
```

### Browser (ES6 Module)

```html
<script type="module">
  import DataMesh from 'https://unpkg.com/@mahendra705/datamesh@latest/index.js';
  
  const users = new DataMesh('id', ['name']);
  // ... use DataMesh
</script>
```

### Browser (UMD)

```html
<script src="https://unpkg.com/@mahendra705/datamesh@latest/dist/datamesh.umd.js"></script>
<script>
  const users = new DataMesh('id', ['name']);
  // ... use DataMesh
</script>
```

> **Note:** Browser builds will be available after the first npm publish.

## 🧪 Testing

```bash
# Run tests
npm test

# Run linting
npm run lint

# Format code
npm run format
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

- 📧 Email: manishagrawal705@gmail.com
- 🐛 Issues: [GitHub Issues](https://github.com/mahendra705/datamesh/issues)
- 📖 Documentation: [GitHub Wiki](https://github.com/mahendra705/datamesh/wiki)

---

**Made with ❤️ for the JavaScript community**
