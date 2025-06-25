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

const todos = createCollection({
  ...localOnlyCollectionOptions<Todo>({
    getKey: (todo) => todo.id,
  }),
})

// Insert items
todos.insert({ id: 1, title: "Buy milk", completed: false })

// Update items
todos.update(1, (draft) => {
  draft.completed = true
})

// Delete items
todos.delete(1)
```

#### Features

- ✅ Single insert operations
- ✅ Batch insert operations  
- ✅ Update operations
- ✅ Change subscriptions
- ✅ All Collection utility methods
- ✅ Schema validation support
- ✅ Direct persistence handlers
- ⚠️ Sequential individual operations (known limitation)

The localOnly collection provides a simple loopback sync configuration that allows all changes to work optimistically without requiring external sync sources.
