/*
This is the intermediate representation of the query.
*/

import type { CollectionImpl } from "../collection"

export interface Query {
  from: From
  select?: Select
  join?: Join
  where?: Where
  groupBy?: GroupBy
  having?: Having
  orderBy?: OrderBy
  limit?: Limit
  offset?: Offset
}

export type From = CollectionRef | QueryRef

export type Select = {
  [alias: string]: Expression | Agg
}

export type Join = Array<JoinClause>

export interface JoinClause {
  from: CollectionRef | QueryRef
  type: `left` | `right` | `inner` | `outer` | `full` | `cross`
  left: Expression
  right: Expression
}

export type Where = Expression

export type GroupBy = Array<Expression>

export type Having = Where

export type OrderBy = Array<{
  expression: Expression
  direction: `asc` | `desc`
}>

export type Limit = number

export type Offset = number

/* Expressions */

abstract class BaseExpression {
  public abstract type: string
}

export class CollectionRef extends BaseExpression {
  public type = `collectionRef` as const
  constructor(
    public collection: CollectionImpl,
    public alias: string
  ) {
    super()
  }
}

export class QueryRef extends BaseExpression {
  public type = `queryRef` as const
  constructor(
    public query: Query,
    public alias: string
  ) {
    super()
  }
}

export class Ref extends BaseExpression {
  public type = `ref` as const
  constructor(
    public path: Array<string> // path to the property in the collection, with the alias as the first element
  ) {
    super()
  }
}

export class Value extends BaseExpression {
  public type = `val` as const
  constructor(
    public value: unknown // any js value
  ) {
    super()
  }
}

export class Func extends BaseExpression {
  public type = `func` as const
  constructor(
    public name: string, // such as eq, gt, lt, upper, lower, etc.
    public args: Array<Expression>
  ) {
    super()
  }
}

export type Expression = Ref | Value | Func

export class Agg extends BaseExpression {
  public type = `agg` as const
  constructor(
    public name: string, // such as count, avg, sum, min, max, etc.
    public args: Array<Expression>
  ) {
    super()
  }
}
