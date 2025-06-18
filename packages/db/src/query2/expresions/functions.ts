import { Func, Agg, type Expression } from '../ir'

// Operators

export function eq(left: Expression, right: Expression): Expression {
  return new Func('eq', [left, right])
}

export function gt(left: Expression, right: Expression): Expression {
  return new Func('gt', [left, right])
}

export function gte(left: Expression, right: Expression): Expression {
  return new Func('gte', [left, right])
}

export function lt(left: Expression, right: Expression): Expression {
  return new Func('lt', [left, right])
}

export function lte(left: Expression, right: Expression): Expression {
  return new Func('lte', [left, right])
}

export function and(left: Expression, right: Expression): Expression {
  return new Func('and', [left, right])
}

export function or(left: Expression, right: Expression): Expression {
  return new Func('or', [left, right])
}

export function not(value: Expression): Expression {
  return new Func('not', [value])
}

export function isIn(value: Expression, array: Expression): Expression {
  return new Func('isIn', [value, array])
}

export function like(left: Expression, right: Expression): Expression {
  return new Func('like', [left, right])
}

export function ilike(left: Expression, right: Expression): Expression {
  return new Func('ilike', [left, right])
}

// Functions

export function upper(arg: Expression): Expression {
  return new Func('upper', [arg])
}

export function lower(arg: Expression): Expression {
  return new Func('lower', [arg])
}

export function length(arg: Expression): Expression {
  return new Func('length', [arg])
}

export function concat(array: Expression): Expression {
  return new Func('concat', [array])
}

export function coalesce(array: Expression): Expression {
  return new Func('coalesce', [array])
}

// Aggregates

export function count(arg: Expression): Agg {
  return new Agg('count', [arg])
}

export function avg(arg: Expression): Agg {
  return new Agg('avg', [arg])
}

export function sum(arg: Expression): Agg {
  return new Agg('sum', [arg])
}

export function min(arg: Expression): Agg {
  return new Agg('min', [arg])
}

export function max(arg: Expression): Agg {
  return new Agg('max', [arg])
}
