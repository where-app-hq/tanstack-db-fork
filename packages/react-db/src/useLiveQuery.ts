import { useEffect, useMemo, useState } from "react"
import { createLiveQueryCollection } from "@tanstack/db"
import type {
  Collection,
  Context,
  GetResult,
  InitialQueryBuilder,
  LiveQueryCollectionConfig,
  QueryBuilder,
} from "@tanstack/db"

// Overload 1: Accept just the query function
export function useLiveQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  deps?: Array<unknown>
): {
  state: Map<string | number, GetResult<TContext>>
  data: Array<GetResult<TContext>>
  collection: Collection<GetResult<TContext>, string | number, {}>
}

// Overload 2: Accept config object
export function useLiveQuery<TContext extends Context>(
  config: LiveQueryCollectionConfig<TContext>,
  deps?: Array<unknown>
): {
  state: Map<string | number, GetResult<TContext>>
  data: Array<GetResult<TContext>>
  collection: Collection<GetResult<TContext>, string | number, {}>
}

// Implementation - use function overloads to infer the actual collection type
export function useLiveQuery(configOrQuery: any, deps: Array<unknown> = []) {
  const collection = useMemo(() => {
    // Ensure we always start sync for React hooks
    if (typeof configOrQuery === `function`) {
      return createLiveQueryCollection({
        query: configOrQuery,
        startSync: true,
      })
    } else {
      return createLiveQueryCollection({
        ...configOrQuery,
        startSync: true,
      })
    }
  }, [...deps])

  // Infer types from the actual collection
  type CollectionType =
    typeof collection extends Collection<infer T, any, any> ? T : never
  type KeyType =
    typeof collection extends Collection<any, infer K, any>
      ? K
      : string | number

  const [state, setState] = useState<Map<KeyType, CollectionType>>(
    () => new Map(collection.entries() as any)
  )
  const [data, setData] = useState<Array<CollectionType>>(() =>
    Array.from(collection.values() as any)
  )

  useEffect(() => {
    // Update initial state in case collection has data
    setState(new Map(collection.entries() as any))
    setData(Array.from(collection.values() as any))

    // Subscribe to changes and update state
    const unsubscribe = collection.subscribeChanges(() => {
      setState(new Map(collection.entries() as any))
      setData(Array.from(collection.values() as any))
    })

    // Preload the collection data if not already started
    if (collection.status === `idle`) {
      collection.preload().catch(console.error)
    }

    return unsubscribe
  }, [collection])

  return {
    state,
    data,
    collection: collection as any,
  }
}
