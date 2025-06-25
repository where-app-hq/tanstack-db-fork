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
   * Note: onInsert, onUpdate, onDelete are not exposed as they are handled internally by the loopback sync
   */
  id?: string
  schema?: TSchema
  getKey: CollectionConfig<ResolveType<TExplicit, TSchema, TFallback>>[`getKey`]

  /**
   * Optional initial data to populate the collection with on creation
   * This data will be applied during the initial sync process
   */
  initialData?: Array<ResolveType<TExplicit, TSchema, TFallback>>
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
  const { initialData, ...restConfig } = config

  const syncConfig = createLocalOnlySync<
    ResolveType<TExplicit, TSchema, TFallback>,
    ReturnType<typeof config.getKey>
  >(initialData)

  return {
    ...restConfig,
    sync: syncConfig.sync,
    onInsert: syncConfig.onInsert,
    onUpdate: syncConfig.onUpdate,
    onDelete: syncConfig.onDelete,
    utils: {} as LocalOnlyCollectionUtils,
  }
}

/**
 * Internal function to create Local-only sync configuration
 * This creates a loopback sync that immediately persists all optimistic changes
 */
function createLocalOnlySync<
  T extends object,
  TKey extends string | number = string | number,
>(initialData?: Array<T>) {
  // Store the sync functions so handlers can write back to the collection
  let syncBegin: (() => void) | null = null
  let syncWrite: ((message: { type: OperationType; value: T }) => void) | null =
    null
  let syncCommit: (() => void) | null = null

  const sync: SyncConfig<T, TKey> = {
    sync: (params: Parameters<SyncConfig<T, TKey>[`sync`]>[0]) => {
      const { begin, write, commit } = params

      // Capture the sync functions for use by the persistence handlers
      syncBegin = begin
      syncWrite = write
      syncCommit = commit

      // Initialize the collection with an empty committed state
      // This ensures the collection is ready to receive operations
      begin()
      commit()

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

      // For localOnly collections, we don't need to set up any external subscriptions
      // All changes will be handled optimistically and persist immediately since
      // there's no external sync source to worry about

      // Return an empty unsubscribe function since there's nothing to clean up
      return () => {}
    },

    /**
     * Get the sync metadata for operations (empty for local-only)
     * @returns Empty record since there's no external sync
     */
    getSyncMetadata: (): Record<string, unknown> => ({}),
  }

  // Create persistence handlers that write back through the sync interface
  const onInsert = async (params: InsertMutationFnParams<T>): Promise<void> => {
    if (!syncBegin || !syncWrite || !syncCommit) {
      throw new Error(`LocalOnly sync not initialized`)
    }

    // Write each inserted item back through the sync interface
    syncBegin()
    params.transaction.mutations.forEach((mutation) => {
      if (mutation.type === `insert` && syncWrite) {
        syncWrite({
          type: `insert`,
          value: mutation.modified,
        })
      }
    })
    syncCommit()
  }

  const onUpdate = async (params: UpdateMutationFnParams<T>): Promise<void> => {
    if (!syncBegin || !syncWrite || !syncCommit) {
      throw new Error(`LocalOnly sync not initialized`)
    }

    // Write each updated item back through the sync interface
    syncBegin()
    params.transaction.mutations.forEach((mutation) => {
      if (mutation.type === `update` && syncWrite) {
        syncWrite({
          type: `update`,
          value: mutation.modified,
        })
      }
    })
    syncCommit()
  }

  const onDelete = async (params: DeleteMutationFnParams<T>): Promise<void> => {
    if (!syncBegin || !syncWrite || !syncCommit) {
      throw new Error(`LocalOnly sync not initialized`)
    }

    // Write each deleted item back through the sync interface
    syncBegin()
    params.transaction.mutations.forEach((mutation) => {
      if (mutation.type === `delete` && syncWrite) {
        syncWrite({
          type: `delete`,
          value: mutation.original as T,
        })
      }
    })
    syncCommit()
  }

  return {
    sync,
    onInsert,
    onUpdate,
    onDelete,
  }
}
