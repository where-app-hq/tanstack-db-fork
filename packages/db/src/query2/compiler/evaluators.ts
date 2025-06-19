import type { Expression, Ref, Value, Func, Agg } from "../ir.js"
import type { NamespacedRow } from "../../types.js"

/**
 * Evaluates an expression against a namespaced row structure
 */
export function evaluateExpression(
  expression: Expression | Agg,
  namespacedRow: NamespacedRow
): any {
  switch (expression.type) {
    case "ref":
      return evaluateRef(expression as Ref, namespacedRow)
    case "val":
      return evaluateValue(expression as Value)
    case "func":
      return evaluateFunction(expression as Func, namespacedRow)
    case "agg":
      throw new Error("Aggregate functions should be handled in GROUP BY processing")
    default:
      throw new Error(`Unknown expression type: ${(expression as any).type}`)
  }
}

/**
 * Evaluates a reference expression
 */
function evaluateRef(ref: Ref, namespacedRow: NamespacedRow): any {
  const [tableAlias, ...propertyPath] = ref.path
  
  if (!tableAlias) {
    throw new Error("Reference path cannot be empty")
  }

  const tableData = namespacedRow[tableAlias]
  if (tableData === undefined) {
    return undefined
  }

  // Navigate through the property path
  let value = tableData
  for (const prop of propertyPath) {
    if (value === null || value === undefined) {
      return undefined
    }
    if (typeof value === "object" && prop in value) {
      value = (value as any)[prop]
    } else {
      return undefined
    }
  }

  return value
}

/**
 * Evaluates a value expression (literal)
 */
function evaluateValue(value: Value): any {
  return value.value
}

/**
 * Evaluates a function expression
 */
function evaluateFunction(func: Func, namespacedRow: NamespacedRow): any {
  const args = func.args.map(arg => evaluateExpression(arg, namespacedRow))

  switch (func.name) {
    // Comparison operators
    case "eq":
      return args[0] === args[1]
    case "gt":
      return compareValues(args[0], args[1]) > 0
    case "gte":
      return compareValues(args[0], args[1]) >= 0
    case "lt":
      return compareValues(args[0], args[1]) < 0
    case "lte":
      return compareValues(args[0], args[1]) <= 0

    // Boolean operators
    case "and":
      return args.every(arg => Boolean(arg))
    case "or":
      return args.some(arg => Boolean(arg))
    case "not":
      return !Boolean(args[0])

    // Array operators
    case "in":
      const value = args[0]
      const array = args[1]
      if (!Array.isArray(array)) {
        return false
      }
      return array.includes(value)

    // String operators
    case "like":
      return evaluateLike(args[0], args[1], false)
    case "ilike":
      return evaluateLike(args[0], args[1], true)

    // String functions
    case "upper":
      return typeof args[0] === "string" ? args[0].toUpperCase() : args[0]
    case "lower":
      return typeof args[0] === "string" ? args[0].toLowerCase() : args[0]
    case "length":
      return typeof args[0] === "string" ? args[0].length : 0
    case "concat":
      return args.map(arg => String(arg ?? "")).join("")
    case "coalesce":
      return args.find(arg => arg !== null && arg !== undefined) ?? null

    // Math functions
    case "add":
      return (args[0] ?? 0) + (args[1] ?? 0)
    case "subtract":
      return (args[0] ?? 0) - (args[1] ?? 0)
    case "multiply":
      return (args[0] ?? 0) * (args[1] ?? 0)
    case "divide":
      const divisor = args[1] ?? 0
      return divisor !== 0 ? (args[0] ?? 0) / divisor : null

    default:
      throw new Error(`Unknown function: ${func.name}`)
  }
}

/**
 * Compares two values for ordering
 */
function compareValues(a: any, b: any): number {
  // Handle null/undefined
  if (a == null && b == null) return 0
  if (a == null) return -1
  if (b == null) return 1

  // Handle same types
  if (typeof a === typeof b) {
    if (typeof a === "string") {
      return a.localeCompare(b)
    }
    if (typeof a === "number") {
      return a - b
    }
    if (a instanceof Date && b instanceof Date) {
      return a.getTime() - b.getTime()
    }
  }

  // Convert to strings for comparison if types differ
  return String(a).localeCompare(String(b))
}

/**
 * Evaluates LIKE/ILIKE patterns
 */
function evaluateLike(value: any, pattern: any, caseInsensitive: boolean): boolean {
  if (typeof value !== "string" || typeof pattern !== "string") {
    return false
  }

  const searchValue = caseInsensitive ? value.toLowerCase() : value
  const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern

  // Convert SQL LIKE pattern to regex
  // First escape all regex special chars except % and _
  let regexPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  
  // Then convert SQL wildcards to regex
  regexPattern = regexPattern.replace(/%/g, '.*') // % matches any sequence
  regexPattern = regexPattern.replace(/_/g, '.') // _ matches any single char

  const regex = new RegExp(`^${regexPattern}$`)
  return regex.test(searchValue)
} 