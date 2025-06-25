import type {
  CollectionConfig,
  DeleteMutationFnParams,
  InsertMutationFnParams,
  OperationType,
  ResolveType,
  SyncConfig,
  UpdateMutationFnParams,
  UtilsRecord,
} from "@tanstack/db"
import type { StandardSchemaV1 } from "@standard-schema/spec"

/**
 * Configuration interface for Local-only collection options
 * @template TExplicit - The explicit type of items in the collection (highest priority)
 * @template TSchema - The schema type for validation and type inference (second priority)
 * @template TFallback - The fallback type if no explicit or schema type is provided
 *
 * @remarks
 * Type resolution follows a priority order:
 * 1. If you provide an explicit type via generic parameter, it will be used
 * 2. If no explicit type is provided but a schema is, the schema's output type will be inferred
 * 3. If neither explicit type nor schema is provided, the fallback type will be used
 *
 * You should provide EITHER an explicit type OR a schema, but not both, as they would conflict.
 */
export interface LocalOnlyCollectionConfig<
  TExplicit = unknown,
  TSchema extends StandardSchemaV1 = never,
  TFallback extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Standard Collection configuration properties
   */
  id?: string
  schema?: TSchema
  getKey: CollectionConfig<ResolveType<TExplicit, TSchema, TFallback>>[`getKey`]

  /**
   * Optional initial data to populate the collection with on creation
   * This data will be applied during the initial sync process
   */
  initialData?: Array<ResolveType<TExplicit, TSchema, TFallback>>

  /**
   * Optional asynchronous handler function called after an insert operation
   * @param params Object containing transaction and mutation information
   * @returns Promise resolving to any value
   */
  onInsert?: (
    params: InsertMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>
  ) => Promise<any>

  /**
   * Optional asynchronous handler function called after an update operation
   * @param params Object containing transaction and mutation information
   * @returns Promise resolving to any value
   */
  onUpdate?: (
    params: UpdateMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>
  ) => Promise<any>

  /**
   * Optional asynchronous handler function called after a delete operation
   * @param params Object containing transaction and mutation information
   * @returns Promise resolving to any value
   */
  onDelete?: (
    params: DeleteMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>
  ) => Promise<any>
}

/**
 * Local-only collection utilities type (currently empty but matches the pattern)
 */
export interface LocalOnlyCollectionUtils extends UtilsRecord {}

/**
 * Creates Local-only collection options for use with a standard Collection
 * This is an in-memory collection that doesn't sync but uses a loopback sync config
 * that immediately "syncs" all optimistic changes to the collection.
 *
 * @template TExplicit - The explicit type of items in the collection (highest priority)
 * @template TSchema - The schema type for validation and type inference (second priority)
 * @template TFallback - The fallback type if no explicit or schema type is provided
 * @param config - Configuration options for the Local-only collection
 * @returns Collection options with utilities
 */
export function localOnlyCollectionOptions<
  TExplicit = unknown,
  TSchema extends StandardSchemaV1 = never,
  TFallback extends Record<string, unknown> = Record<string, unknown>,
>(config: LocalOnlyCollectionConfig<TExplicit, TSchema, TFallback>) {
  type ResolvedType = ResolveType<TExplicit, TSchema, TFallback>

  const { initialData, onInsert, onUpdate, onDelete, ...restConfig } = config

  // Create the sync configuration with transaction confirmation capability
  const syncResult = createLocalOnlySync<ResolvedType>(initialData)

  // Create wrapper handlers that confirm transactions + call user handlers
  const wrappedOnInsert = async (
    params: InsertMutationFnParams<ResolvedType>
  ) => {
    // Synchronously confirm the transaction by looping through mutations
    syncResult.confirmOperationsSync(params.transaction.mutations)

    // Call user handler if provided
    if (onInsert) {
      const handlerResult = (await onInsert(params)) ?? {}
      return handlerResult
    }
  }

  const wrappedOnUpdate = async (
    params: UpdateMutationFnParams<ResolvedType>
  ) => {
    // Synchronously confirm the transaction by looping through mutations
    syncResult.confirmOperationsSync(params.transaction.mutations)

    // Call user handler if provided
    if (onUpdate) {
      const handlerResult = (await onUpdate(params)) ?? {}
      return handlerResult
    }
  }

  const wrappedOnDelete = async (
    params: DeleteMutationFnParams<ResolvedType>
  ) => {
    // Synchronously confirm the transaction by looping through mutations
    syncResult.confirmOperationsSync(params.transaction.mutations)

    // Call user handler if provided
    if (onDelete) {
      const handlerResult = (await onDelete(params)) ?? {}
      return handlerResult
    }
  }

  return {
    ...restConfig,
    sync: syncResult.sync,
    onInsert: wrappedOnInsert,
    onUpdate: wrappedOnUpdate,
    onDelete: wrappedOnDelete,
    utils: {} as LocalOnlyCollectionUtils,
  }
}

/**
 * Internal function to create Local-only sync configuration with transaction confirmation
 * This captures the sync functions and provides synchronous confirmation of operations
 */
function createLocalOnlySync<T extends object>(initialData?: Array<T>) {
  // Capture sync functions for transaction confirmation
  let syncBegin: (() => void) | null = null
  let syncWrite: ((message: { type: OperationType; value: T }) => void) | null =
    null
  let syncCommit: (() => void) | null = null

  const sync: SyncConfig<T> = {
    sync: (params) => {
      const { begin, write, commit } = params

      // Capture sync functions for later use by confirmOperationsSync
      syncBegin = begin
      syncWrite = write
      syncCommit = commit

      // Apply initial data if provided
      if (initialData && initialData.length > 0) {
        begin()
        initialData.forEach((item) => {
          write({
            type: `insert`,
            value: item,
          })
        })
        commit()
      }

      // Return empty unsubscribe function - no ongoing sync needed
      return () => {}
    },
    getSyncMetadata: () => ({}),
  }

  /**
   * Synchronously confirms optimistic operations by immediately writing through sync
   * This loops through transaction mutations and applies them to move from optimistic to synced state
   */
  const confirmOperationsSync = (mutations: Array<any>) => {
    if (!syncBegin || !syncWrite || !syncCommit) {
      return // Sync not initialized yet, which is fine
    }

    // Immediately write back through sync interface
    syncBegin()
    mutations.forEach((mutation) => {
      if (syncWrite) {
        syncWrite({
          type: mutation.type,
          value: mutation.modified,
        })
      }
    })
    syncCommit()
  }

  return {
    sync,
    confirmOperationsSync,
  }
}
