import { Func, Agg, type Expression } from '../ir'
import { toExpression, type RefProxy } from '../query-builder/ref-proxy.js'

// Helper type for values that can be converted to expressions
type ExpressionLike = Expression | RefProxy | any

// Operators

export function eq(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('eq', [toExpression(left), toExpression(right)])
}

export function gt(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('gt', [toExpression(left), toExpression(right)])
}

export function gte(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('gte', [toExpression(left), toExpression(right)])
}

export function lt(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('lt', [toExpression(left), toExpression(right)])
}

export function lte(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('lte', [toExpression(left), toExpression(right)])
}

export function and(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('and', [toExpression(left), toExpression(right)])
}

export function or(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('or', [toExpression(left), toExpression(right)])
}

export function not(value: ExpressionLike): Expression {
  return new Func('not', [toExpression(value)])
}

export function isIn(value: ExpressionLike, array: ExpressionLike): Expression {
  return new Func('in', [toExpression(value), toExpression(array)])
}

// Export as 'in' for the examples in README
export { isIn as in }

export function like(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('like', [toExpression(left), toExpression(right)])
}

export function ilike(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('ilike', [toExpression(left), toExpression(right)])
}

// Functions

export function upper(arg: ExpressionLike): Expression {
  return new Func('upper', [toExpression(arg)])
}

export function lower(arg: ExpressionLike): Expression {
  return new Func('lower', [toExpression(arg)])
}

export function length(arg: ExpressionLike): Expression {
  return new Func('length', [toExpression(arg)])
}

export function concat(array: ExpressionLike): Expression {
  return new Func('concat', [toExpression(array)])
}

export function coalesce(array: ExpressionLike): Expression {
  return new Func('coalesce', [toExpression(array)])
}

export function add(left: ExpressionLike, right: ExpressionLike): Expression {
  return new Func('add', [toExpression(left), toExpression(right)])
}

// Aggregates

export function count(arg: ExpressionLike): Agg {
  return new Agg('count', [toExpression(arg)])
}

export function avg(arg: ExpressionLike): Agg {
  return new Agg('avg', [toExpression(arg)])
}

export function sum(arg: ExpressionLike): Agg {
  return new Agg('sum', [toExpression(arg)])
}

export function min(arg: ExpressionLike): Agg {
  return new Agg('min', [toExpression(arg)])
}

export function max(arg: ExpressionLike): Agg {
  return new Agg('max', [toExpression(arg)])
}
