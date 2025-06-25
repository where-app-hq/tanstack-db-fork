# @tanstack/db-collections

A collection for (aspirationally) every way of loading your data.

## Collections

### Electric Collection

For syncing with ElectricSQL.

### Query Collection

For loading data from TanStack Query.

### Local-Only Collection

For in-memory collections that don't sync to external sources.

The `localOnly` collection is a simple in-memory collection that works entirely optimistically. It's perfect for:

- Local-only data that doesn't need to sync
- Temporary collections for UI state
- Testing and development

#### Usage

```typescript
import { createCollection } from "@tanstack/db"
import { localOnlyCollectionOptions } from "@tanstack/db-collections"

interface Todo {
  id: number
  title: string
  completed: boolean
}

// Create with optional initial data
const todos = createCollection({
  ...localOnlyCollectionOptions<Todo>({
    getKey: (todo) => todo.id,
    initialData: [
      { id: 1, title: "Buy milk", completed: false },
      { id: 2, title: "Walk dog", completed: true },
    ],
  }),
})

// Collection starts with initial data
console.log(todos.size) // 2

// All operations work automatically with loopback sync
// Insert items
await todos.insert({ id: 3, title: "New item", completed: false })

// Update items  
await todos.update(1, (draft) => {
  draft.completed = true
})

// Delete items
await todos.delete(2)
```

#### Features

- ✅ Single insert operations
- ✅ Batch insert operations  
- ✅ Update operations
- ✅ Delete operations
- ✅ Change subscriptions
- ✅ All Collection utility methods
- ✅ Schema validation support
- ✅ True loopback sync (mutations automatically write back via sync interface)
- ✅ Optional initial data population
- ⚠️ Sequential mixed operations (1 edge case)

The localOnly collection implements a true loopback sync where all mutations automatically write back to the collection through the sync interface. Users don't need to provide onInsert/onUpdate/onDelete handlers - everything is handled internally by the loopback mechanism.
