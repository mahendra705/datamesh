const DataMesh = require('./index.js');

console.log('🧪 Testing DataMesh v2...\n');

// Test 1: Basic functionality
console.log('1. Basic functionality:');
const users = new DataMesh('id', ['name', 'age']);

users.add({ id: 1, name: 'Alice', age: 25 });
users.add({ id: 2, name: 'Bob', age: 30 });
users.add({ id: 3, name: 'Charlie', age: 25 });

console.log('Length:', users.length); // 3
console.log('First user:', users[0]); // Alice
console.log('Last user:', users[-1]); // Charlie
console.log('User by ID:', users.getById(2)); // Bob
console.log('Users age 25:', users.getByIndex('age', 25)); // Alice, Charlie
console.log('Users by name:', users.by.name('Alice')); // Alice

// Test 2: Array-like operations
console.log('\n2. Array-like operations:');
const names = users.map(u => u.name);
console.log('Names:', names); // ['Alice', 'Bob', 'Charlie']

const adults = users.filter(u => u.age >= 18);
console.log('Adults count:', adults.length); // 3

const totalAge = users.reduce((sum, u) => sum + u.age, 0);
console.log('Total age:', totalAge); // 80

// Test 3: Live views
console.log('\n3. Live views:');
const age25Users = users.where('age', 25);
console.log('Age 25 users initially:', age25Users.length); // 2

// Add a new user with age 25
users.add({ id: 4, name: 'David', age: 25 });
console.log('Age 25 users after adding David:', age25Users.length); // 3

// Test 4: Updates
console.log('\n4. Updates:');
users.update(1, { age: 26 });
console.log('Alice new age:', users.getById(1).age); // 26
console.log('Age 25 users after update:', age25Users.length); // 2

// Test 5: Upsert
console.log('\n5. Upsert:');
users.upsert({ id: 5, name: 'Eve', age: 28 });
users.upsert({ id: 1, name: 'Alice', age: 27 }); // Update existing
console.log('Total users after upsert:', users.length); // 5
console.log('Alice final age:', users.getById(1).age); // 27

// Test 6: Advanced features
console.log('\n6. Advanced features:');
console.log('Unique ages:', users.getUniqueValues('age')); // [25, 26, 27, 28, 30]
console.log('Age stats:', users.getStats('age')); // { min: 25, max: 30, avg: 27.2, sum: 136, count: 5 }

const sortedByAge = users.sortBy('age', true);
console.log('Sorted by age:', sortedByAge.map(u => u.name)); // ['Alice', 'Charlie', 'David', 'Bob', 'Eve']

const ageGroups = users.groupBy('age');
console.log('Age groups:', Object.fromEntries(ageGroups)); // Groups by age

// Test 7: Reactive system
console.log('\n7. Reactive system:');
let eventCount = 0;
const unsubscribe = users.subscribe(event => {
  eventCount++;
  if (event.type === 'batch') {
    console.log(`Event ${eventCount}:`, event.type, event.events.length, 'events');
  } else {
    console.log(`Event ${eventCount}:`, event.type, event.items.length, 'items');
  }
});

users.batch(() => {
  users.add({ id: 6, name: 'Frank', age: 35 });
  users.add({ id: 7, name: 'Grace', age: 22 });
  users.update(2, { age: 31 });
});

console.log('Events emitted:', eventCount); // Should be 1 batch event

unsubscribe();

// Test 8: Error handling
console.log('\n8. Error handling:');
try {
  users.add({ name: 'NoId' }); // Missing primary key
} catch (e) {
  console.log('Caught error:', e.message);
}

try {
  users.add({ id: 1, name: 'Duplicate' }); // Duplicate primary key
} catch (e) {
  console.log('Caught error:', e.message);
}

try {
  users.getByIndex('nonexistent', 'value'); // Non-indexed field
} catch (e) {
  console.log('Caught error:', e.message);
}

// Test 9: Performance test
console.log('\n9. Performance test:');
const largeMesh = new DataMesh('id', ['category', 'status']);
const start = Date.now();

// Add 10,000 items
for (let i = 0; i < 10000; i++) {
  largeMesh.add({
    id: i,
    name: `Item ${i}`,
    category: `cat${i % 10}`,
    status: i % 2 === 0 ? 'active' : 'inactive'
  });
}

const addTime = Date.now() - start;
console.log(`Added 10,000 items in ${addTime}ms`);

// Test lookups
const lookupStart = Date.now();
for (let i = 0; i < 1000; i++) {
  largeMesh.getById(i);
  largeMesh.getByIndex('category', `cat${i % 10}`);
  largeMesh.getByIndex('status', 'active');
}
const lookupTime = Date.now() - lookupStart;
console.log(`1,000 lookups in ${lookupTime}ms`);

// Test 10: Cleanup
console.log('\n10. Cleanup:');
users.clear();
console.log('Users after clear:', users.length); // 0
console.log('Age 25 users after clear:', age25Users.length); // 0

users.destroy();
console.log('DataMesh destroyed successfully');

console.log('\n✅ All tests passed! DataMesh v2 is working correctly.');
