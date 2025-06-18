import { Func, Agg, type Expression } from '../ir'
import { toExpression, type RefProxy } from '../query-builder/ref-proxy.js'

// Helper types for type-safe expressions - cleaned up

// Helper type for string operations
type StringLike<T> = T extends RefProxy<string> 
  ? RefProxy<string> | string | Expression
  : T extends string 
    ? string | Expression
    : Expression

// Helper type for numeric operations
type NumberLike<T> = T extends RefProxy<number> 
  ? RefProxy<number> | number | Expression
  : T extends number 
    ? number | Expression
    : Expression

// Helper type for any expression-like value
type ExpressionLike = Expression | RefProxy<any> | any

// Operators

export function eq(left: RefProxy<string>, right: string | RefProxy<string> | Expression): Expression
export function eq(left: RefProxy<number>, right: number | RefProxy<number> | Expression): Expression
export function eq(left: RefProxy<boolean>, right: boolean | RefProxy<boolean> | Expression): Expression
export function eq<T>(left: RefProxy<T>, right: T | RefProxy<T> | Expression): Expression
export function eq(left: string, right: string | Expression): Expression
export function eq(left: number, right: number | Expression): Expression
export function eq(left: boolean, right: boolean | Expression): Expression
export function eq(left: Expression, right: string | number | boolean | Expression): Expression
export function eq(left: any, right: any): Expression {
  return new Func('eq', [toExpression(left), toExpression(right)])
}

export function gt(left: RefProxy<number>, right: number | RefProxy<number> | Expression): Expression
export function gt(left: RefProxy<string>, right: string | RefProxy<string> | Expression): Expression
export function gt<T extends string | number>(left: RefProxy<T>, right: T | RefProxy<T> | Expression): Expression
export function gt(left: number, right: number | Expression): Expression
export function gt(left: string, right: string | Expression): Expression
export function gt(left: any, right: any): Expression {
  return new Func('gt', [toExpression(left), toExpression(right)])
}

export function gte(left: RefProxy<number>, right: number | RefProxy<number> | Expression): Expression
export function gte(left: RefProxy<string>, right: string | RefProxy<string> | Expression): Expression
export function gte<T extends string | number>(left: RefProxy<T>, right: T | RefProxy<T> | Expression): Expression
export function gte(left: number, right: number | Expression): Expression
export function gte(left: string, right: string | Expression): Expression
export function gte(left: any, right: any): Expression {
  return new Func('gte', [toExpression(left), toExpression(right)])
}

export function lt(left: RefProxy<number>, right: number | RefProxy<number> | Expression): Expression
export function lt(left: RefProxy<string>, right: string | RefProxy<string> | Expression): Expression
export function lt<T extends string | number>(left: RefProxy<T>, right: T | RefProxy<T> | Expression): Expression
export function lt(left: number, right: number | Expression): Expression
export function lt(left: string, right: string | Expression): Expression
export function lt(left: any, right: any): Expression {
  return new Func('lt', [toExpression(left), toExpression(right)])
}

export function lte(left: RefProxy<number>, right: number | RefProxy<number> | Expression): Expression
export function lte(left: RefProxy<string>, right: string | RefProxy<string> | Expression): Expression
export function lte<T extends string | number>(left: RefProxy<T>, right: T | RefProxy<T> | Expression): Expression
export function lte(left: number, right: number | Expression): Expression
export function lte(left: string, right: string | Expression): Expression
export function lte(left: any, right: any): Expression {
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

export function like<T extends RefProxy<string> | string>(left: T, right: StringLike<T>): Expression {
  return new Func('like', [toExpression(left), toExpression(right)])
}

export function ilike<T extends RefProxy<string> | string>(left: T, right: StringLike<T>): Expression {
  return new Func('ilike', [toExpression(left), toExpression(right)])
}

// Functions

export function upper(arg: RefProxy<string> | string): Expression {
  return new Func('upper', [toExpression(arg)])
}

export function lower(arg: RefProxy<string> | string): Expression {
  return new Func('lower', [toExpression(arg)])
}

export function length(arg: RefProxy<string> | string): Expression {
  return new Func('length', [toExpression(arg)])
}

export function concat(array: ExpressionLike): Expression {
  return new Func('concat', [toExpression(array)])
}

export function coalesce(array: ExpressionLike): Expression {
  return new Func('coalesce', [toExpression(array)])
}

export function add<T extends RefProxy<number> | number>(left: T, right: NumberLike<T>): Expression {
  return new Func('add', [toExpression(left), toExpression(right)])
}

// Aggregates

export function count(arg: ExpressionLike): Agg {
  return new Agg('count', [toExpression(arg)])
}

export function avg(arg: RefProxy<number> | number): Agg {
  return new Agg('avg', [toExpression(arg)])
}

export function sum(arg: RefProxy<number> | number): Agg {
  return new Agg('sum', [toExpression(arg)])
}

export function min<T>(arg: T): Agg {
  return new Agg('min', [toExpression(arg)])
}

export function max<T>(arg: T): Agg {
  return new Agg('max', [toExpression(arg)])
}
