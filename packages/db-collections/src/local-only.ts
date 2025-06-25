import type {
  CollectionConfig,
  DeleteMutationFnParams,
  InsertMutationFnParams,
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
   * All standard Collection configuration properties
   */
  id?: string
  schema?: TSchema
  getKey: CollectionConfig<ResolveType<TExplicit, TSchema, TFallback>>[`getKey`]
  sync?: CollectionConfig<ResolveType<TExplicit, TSchema, TFallback>>[`sync`]

  /**
   * Optional asynchronous handler function called before an insert operation
   * @param params Object containing transaction and mutation information
   * @returns Promise resolving to any value
   */
  onInsert?: (
    params: InsertMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>
  ) => Promise<any>

  /**
   * Optional asynchronous handler function called before an update operation
   * @param params Object containing transaction and mutation information
   * @returns Promise resolving to any value
   */
  onUpdate?: (
    params: UpdateMutationFnParams<ResolveType<TExplicit, TSchema, TFallback>>
  ) => Promise<any>

  /**
   * Optional asynchronous handler function called before a delete operation
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
  const sync = createLocalOnlySync<
    ResolveType<TExplicit, TSchema, TFallback>,
    ReturnType<typeof config.getKey>
  >()

  // Extract standard Collection config properties
  const { onInsert, onUpdate, onDelete, ...restConfig } = config

  // For localOnly collections, provide default no-op handlers if none are specified
  // This allows all operations to work optimistically without requiring explicit handlers
  const defaultOnInsert = onInsert || (async () => ({}))
  const defaultOnUpdate = onUpdate || (async () => ({}))
  const defaultOnDelete = onDelete || (async () => ({}))

  return {
    ...restConfig,
    sync,
    onInsert: defaultOnInsert,
    onUpdate: defaultOnUpdate,
    onDelete: defaultOnDelete,
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
>(): SyncConfig<T, TKey> {
  return {
    sync: (params: Parameters<SyncConfig<T, TKey>[`sync`]>[0]) => {
      const { begin, commit } = params

      // Initialize the collection with an empty committed state
      // This ensures the collection is ready to receive operations
      begin()
      commit()

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
}
