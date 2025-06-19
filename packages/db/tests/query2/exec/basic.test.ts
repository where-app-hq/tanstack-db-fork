import { describe, test, expect } from "vitest"
import { createLiveQueryCollection, eq, gt } from "../../../src/query2/index.js"
import { createCollection } from "../../../src/collection.js"

// Sample user type for tests
type User = {
  id: number
  name: string
  age: number
  email: string
  active: boolean
}

// Sample data for tests
const sampleUsers: Array<User> = [
  { id: 1, name: "Alice", age: 25, email: "alice@example.com", active: true },
  { id: 2, name: "Bob", age: 19, email: "bob@example.com", active: true },
  {
    id: 3,
    name: "Charlie",
    age: 30,
    email: "charlie@example.com",
    active: false,
  },
  { id: 4, name: "Dave", age: 22, email: "dave@example.com", active: true },
]

describe("Query", () => {
  test("should execute a simple query", () => {
    
  })
})

describe("createLiveQueryCollection", () => {
  // Create a base collection with sample data
  const usersCollection = createCollection<User>({
    id: "test-users",
    getKey: (user) => user.id,
    sync: {
      sync: ({ begin, write, commit }) => {
        begin()
        // Add sample data
        sampleUsers.forEach(user => {
          write({
            type: "insert",
            value: user,
          })
        })
        commit()
      },
    },
  })

  test("should create a live query collection with FROM clause", async () => {
    const liveCollection = createLiveQueryCollection({
      query: (q) => q
        .from({ user: usersCollection })
        .select(({ user }) => ({
          id: user.id,
          name: user.name,
          age: user.age,
          email: user.email,
          active: user.active,
        })),
    })

    // Wait for initial sync
    const results = await liveCollection.toArrayWhenReady()
    
    expect(results).toHaveLength(4)
    expect(results.map(u => u.name)).toEqual(
      expect.arrayContaining(["Alice", "Bob", "Charlie", "Dave"])
    )
  })

  test("should create a live query collection with WHERE clause", async () => {
    const activeLiveCollection = createLiveQueryCollection({
      query: (q) => q
        .from({ user: usersCollection })
        .where(({ user }) => eq(user.active, true))
        .select(({ user }) => ({
          id: user.id,
          name: user.name,
          active: user.active,
        })),
    })

    const results = await activeLiveCollection.toArrayWhenReady()
    
    expect(results).toHaveLength(3)
    expect(results.every(u => u.active)).toBe(true)
    expect(results.map(u => u.name)).toEqual(
      expect.arrayContaining(["Alice", "Bob", "Dave"])
    )
  })

  test("should create a live query collection with SELECT projection", async () => {
    const projectedLiveCollection = createLiveQueryCollection({
      query: (q) => q
        .from({ user: usersCollection })
        .where(({ user }) => gt(user.age, 20))
        .select(({ user }) => ({
          id: user.id,
          name: user.name,
          isAdult: user.age,
        })),
    })

    const results = await projectedLiveCollection.toArrayWhenReady()
    
    expect(results).toHaveLength(3) // Alice (25), Charlie (30), Dave (22)
    
    // Check that results only have the projected fields
    results.forEach(result => {
      expect(result).toHaveProperty("id")
      expect(result).toHaveProperty("name")
      expect(result).toHaveProperty("isAdult")
      expect(result).not.toHaveProperty("email")
      expect(result).not.toHaveProperty("active")
    })
    
    expect(results.map(u => u.name)).toEqual(
      expect.arrayContaining(["Alice", "Charlie", "Dave"])
    )
  })

  test("should use default getKey from stream when not provided", async () => {
    const defaultKeyCollection = createLiveQueryCollection({
      query: (q) => q
        .from({ user: usersCollection })
        .select(({ user }) => ({
          userId: user.id,
          userName: user.name,
        })),
      // No getKey provided - should use stream key
    })

    const results = await defaultKeyCollection.toArrayWhenReady()
    
    expect(results).toHaveLength(4)
    
    // Verify that items have _key property from stream
    results.forEach(result => {
      expect(result).toHaveProperty("_key")
      expect(result).toHaveProperty("userId")
      expect(result).toHaveProperty("userName")
    })
  })

  test("should use custom getKey when provided", async () => {
    const customKeyCollection = createLiveQueryCollection({
      id: "custom-key-users",
      query: (q) => q
        .from({ user: usersCollection })
        .select(({ user }) => ({
          userId: user.id,
          userName: user.name,
        })),
      getKey: (item) => item.userId, // Custom key extraction
    })

    const results = await customKeyCollection.toArrayWhenReady()
    
    expect(results).toHaveLength(4)
    
    // Verify we can get items by their custom key
    expect(customKeyCollection.get(1)).toMatchObject({
      userId: 1,
      userName: "Alice",
    })
    expect(customKeyCollection.get(2)).toMatchObject({
      userId: 2,
      userName: "Bob",
    })
  })

  test("should auto-generate unique IDs when not provided", async () => {
    const collection1 = createLiveQueryCollection({
      query: (q) => q
        .from({ user: usersCollection })
        .select(({ user }) => ({
          id: user.id,
          name: user.name,
        })),
    })

    const collection2 = createLiveQueryCollection({
      query: (q) => q
        .from({ user: usersCollection })
        .where(({ user }) => eq(user.active, true))
        .select(({ user }) => ({
          id: user.id,
          name: user.name,
        })),
    })

    // Verify that auto-generated IDs are unique and follow the expected pattern
    expect(collection1.id).toMatch(/^live-query-\d+$/)
    expect(collection2.id).toMatch(/^live-query-\d+$/)
    expect(collection1.id).not.toBe(collection2.id)
    
    // Verify collections work correctly
    const results1 = await collection1.toArrayWhenReady()
    const results2 = await collection2.toArrayWhenReady()
    
    expect(results1).toHaveLength(4) // All users
    expect(results2).toHaveLength(3) // Only active users
  })
})