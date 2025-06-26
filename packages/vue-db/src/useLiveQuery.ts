import {
  computed,
  getCurrentInstance,
  onUnmounted,
  ref,
  toValue,
  watchEffect,
} from "vue"
import { createLiveQueryCollection } from "@tanstack/db"
import type {
  Collection,
  Context,
  GetResult,
  InitialQueryBuilder,
  LiveQueryCollectionConfig,
  QueryBuilder,
} from "@tanstack/db"
import type { ComputedRef, MaybeRefOrGetter } from "vue"

export interface UseLiveQueryReturn<T extends object> {
  state: ComputedRef<Map<string | number, T>>
  data: ComputedRef<Array<T>>
  collection: ComputedRef<Collection<T, string | number, {}>>
}

// Overload 1: Accept just the query function
export function useLiveQuery<TContext extends Context>(
  queryFn: (q: InitialQueryBuilder) => QueryBuilder<TContext>,
  deps?: Array<MaybeRefOrGetter<unknown>>
): UseLiveQueryReturn<GetResult<TContext>>

// Overload 2: Accept config object
export function useLiveQuery<TContext extends Context>(
  config: LiveQueryCollectionConfig<TContext>,
  deps?: Array<MaybeRefOrGetter<unknown>>
): UseLiveQueryReturn<GetResult<TContext>>

// Implementation
export function useLiveQuery(
  configOrQuery: any,
  deps: Array<MaybeRefOrGetter<unknown>> = []
): UseLiveQueryReturn<any> {
  const collection = computed(() => {
    // Reference deps to make computed reactive to them
    deps.forEach((dep) => toValue(dep))

    // Ensure we always start sync for Vue hooks
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
  })

  // Reactive state that updates when collection changes
  const state = ref<Map<string | number, any>>(new Map())
  const data = ref<Array<any>>([])

  // Track current unsubscribe function
  let currentUnsubscribe: (() => void) | null = null

  // Watch for collection changes and subscribe to updates
  watchEffect((onInvalidate) => {
    const currentCollection = collection.value

    // Clean up previous subscription
    if (currentUnsubscribe) {
      currentUnsubscribe()
    }

    // Update initial state function
    const updateState = () => {
      const newEntries = new Map(currentCollection.entries())
      const newData = Array.from(currentCollection.values())

      // Force Vue reactivity by creating new references
      state.value = newEntries
      data.value = newData
    }

    // Set initial state
    updateState()

    // Subscribe to collection changes
    currentUnsubscribe = currentCollection.subscribeChanges(() => {
      updateState()
    })

    // Preload collection data if not already started
    if (currentCollection.status === `idle`) {
      currentCollection.preload().catch(console.error)
    }

    // Cleanup when effect is invalidated
    onInvalidate(() => {
      if (currentUnsubscribe) {
        currentUnsubscribe()
        currentUnsubscribe = null
      }
    })
  })

  // Cleanup on unmount (only if we're in a component context)
  const instance = getCurrentInstance()
  if (instance) {
    onUnmounted(() => {
      if (currentUnsubscribe) {
        currentUnsubscribe()
      }
    })
  }

  return {
    state: computed(() => state.value),
    data: computed(() => data.value),
    collection: computed(() => collection.value),
  }
}
