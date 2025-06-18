import { CollectionImpl } from "../../collection.js"
import { CollectionRef, QueryRef, type Query } from "../ir.js"
import type { Context } from "./types.js"

export function buildQuery(
  fn: (builder: InitialQueryBuilder<any>) => QueryBuilder<any>
) {
  return fn(new BaseQueryBuilder())
}

export type Source = {
  [alias: string]: CollectionImpl | BaseQueryBuilder<any>
}

export class BaseQueryBuilder<TContext extends Context> {
  private readonly query: Partial<Query> = {}

  constructor(query: Partial<Query> = {}) {
    this.query = query
  }

  from(source: Source) {
    if (Object.keys(source).length !== 1) {
      throw new Error("Only one source is allowed in the from clause")
    }
    const alias = Object.keys(source)[0]!
    const sourceValue = source[alias]
    if (sourceValue instanceof CollectionImpl) {
      return new BaseQueryBuilder({
        ...this.query,
        from: new CollectionRef(sourceValue, alias),
      })
    } else if (sourceValue instanceof BaseQueryBuilder) {
      if (!sourceValue.query.from) {
        throw new Error(
          "A sub query passed to a from clause must have a from clause itself"
        )
      }
      return new BaseQueryBuilder({
        ...this.query,
        from: new QueryRef(sourceValue.query as Query, alias),
      })
    } else {
      throw new Error("Invalid source")
    }
  }

  // TODO: all the other methods
}

export type InitialQueryBuilder<TContext extends Context> = Pick<
  BaseQueryBuilder<TContext>,
  "from"
>

export type QueryBuilder<TContext extends Context> = Omit<
  BaseQueryBuilder<TContext>,
  "from"
>
