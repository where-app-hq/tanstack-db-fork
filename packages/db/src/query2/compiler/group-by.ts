import { filter, groupBy, groupByOperators, map } from "@electric-sql/d2mini"
import { evaluateExpression } from "./evaluators.js"
import type { Agg, GroupBy, Having, Select } from "../ir.js"
import type { NamespacedAndKeyedStream, NamespacedRow } from "../../types.js"

const { sum, count, avg, min, max } = groupByOperators

/**
 * Interface for caching the mapping between GROUP BY expressions and SELECT expressions
 */
interface GroupBySelectMapping {
  selectToGroupByIndex: Map<string, number> // Maps SELECT alias to GROUP BY expression index
  groupByExpressions: Array<any> // The GROUP BY expressions for reference
}

/**
 * Validates that all non-aggregate expressions in SELECT are present in GROUP BY
 * and creates a cached mapping for efficient lookup during processing
 */
function validateAndCreateMapping(
  groupByClause: GroupBy,
  selectClause?: Select
): GroupBySelectMapping {
  const selectToGroupByIndex = new Map<string, number>()
  const groupByExpressions = [...groupByClause]

  if (!selectClause) {
    return { selectToGroupByIndex, groupByExpressions }
  }

  // Validate each SELECT expression
  for (const [alias, expr] of Object.entries(selectClause)) {
    if (expr.type === "agg") {
      // Aggregate expressions are allowed and don't need to be in GROUP BY
      continue
    }

    // Non-aggregate expression must be in GROUP BY
    const groupIndex = groupByExpressions.findIndex((groupExpr) =>
      expressionsEqual(expr, groupExpr)
    )

    if (groupIndex === -1) {
      throw new Error(
        `Non-aggregate expression '${alias}' in SELECT must also appear in GROUP BY clause`
      )
    }

    // Cache the mapping
    selectToGroupByIndex.set(alias, groupIndex)
  }

  return { selectToGroupByIndex, groupByExpressions }
}

/**
 * Processes the GROUP BY clause and optional HAVING clause
 * This function handles the entire SELECT clause for GROUP BY queries
 */
export function processGroupBy(
  pipeline: NamespacedAndKeyedStream,
  groupByClause: GroupBy,
  havingClause?: Having,
  selectClause?: Select
): NamespacedAndKeyedStream {
  // Validate and create mapping once at the beginning
  const mapping = validateAndCreateMapping(groupByClause, selectClause)

  // Create a key extractor function using simple __key_X format
  const keyExtractor = ([_oldKey, namespacedRow]: [string, NamespacedRow]) => {
    const key: Record<string, unknown> = {}

    // Use simple __key_X format for each groupBy expression
    for (let i = 0; i < groupByClause.length; i++) {
      const expr = groupByClause[i]!
      const value = evaluateExpression(expr, namespacedRow)
      key[`__key_${i}`] = value
    }

    return key
  }

  // Create aggregate functions for any aggregated columns in the SELECT clause
  const aggregates: Record<string, any> = {}

  if (selectClause) {
    // Scan the SELECT clause for aggregate functions
    for (const [alias, expr] of Object.entries(selectClause)) {
      if (expr.type === "agg") {
        const aggExpr = expr
        aggregates[alias] = getAggregateFunction(aggExpr)
      }
    }
  }

  // Apply the groupBy operator
  pipeline = pipeline.pipe(groupBy(keyExtractor, aggregates))

  // Process the SELECT clause to handle non-aggregate expressions
  if (selectClause) {
    pipeline = pipeline.pipe(
      map(([key, aggregatedRow]) => {
        const result: Record<string, any> = {}

        // For non-aggregate expressions in SELECT, use cached mapping
        for (const [alias, expr] of Object.entries(selectClause)) {
          if (expr.type !== "agg") {
            // Use cached mapping to get the corresponding __key_X
            const groupIndex = mapping.selectToGroupByIndex.get(alias)
            if (groupIndex !== undefined) {
              result[alias] = aggregatedRow[`__key_${groupIndex}`]
            } else {
              // This should never happen due to validation, but handle gracefully
              result[alias] = null
            }
          } else {
            result[alias] = aggregatedRow[alias]
          }
        }

        // Generate a simple key for the live collection using group values
        let finalKey: unknown
        if (groupByClause.length === 1) {
          finalKey = aggregatedRow[`__key_0`]
        } else {
          const keyParts: unknown[] = []
          for (let i = 0; i < groupByClause.length; i++) {
            keyParts.push(aggregatedRow[`__key_${i}`])
          }
          finalKey = JSON.stringify(keyParts)
        }

        return [finalKey, result] as [unknown, Record<string, any>]
      })
    )
  }

  // Apply HAVING clause if present
  if (havingClause) {
    pipeline = pipeline.pipe(
      filter(([_key, namespacedRow]) => {
        return evaluateExpression(havingClause, namespacedRow)
      })
    )
  }

  return pipeline
}

/**
 * Helper function to check if two expressions are equal
 */
function expressionsEqual(expr1: any, expr2: any): boolean {
  if (!expr1 || !expr2) return false
  if (expr1.type !== expr2.type) return false

  switch (expr1.type) {
    case "ref":
      // Compare paths as arrays
      if (!expr1.path || !expr2.path) return false
      if (expr1.path.length !== expr2.path.length) return false
      return expr1.path.every(
        (segment: string, i: number) => segment === expr2.path[i]
      )
    case "val":
      return expr1.value === expr2.value
    case "func":
      return (
        expr1.name === expr2.name &&
        expr1.args?.length === expr2.args?.length &&
        (expr1.args || []).every((arg: any, i: number) =>
          expressionsEqual(arg, expr2.args[i])
        )
      )
    case "agg":
      return (
        expr1.name === expr2.name &&
        expr1.args?.length === expr2.args?.length &&
        (expr1.args || []).every((arg: any, i: number) =>
          expressionsEqual(arg, expr2.args[i])
        )
      )
    default:
      return false
  }
}

/**
 * Helper function to get an aggregate function based on the Agg expression
 */
function getAggregateFunction(aggExpr: Agg) {
  // Create a value extractor function for the expression to aggregate
  const valueExtractor = ([_oldKey, namespacedRow]: [
    string,
    NamespacedRow,
  ]) => {
    const value = evaluateExpression(aggExpr.args[0]!, namespacedRow)
    // Ensure we return a number for numeric aggregate functions
    return typeof value === "number" ? value : value != null ? Number(value) : 0
  }

  // Return the appropriate aggregate function
  switch (aggExpr.name.toLowerCase()) {
    case "sum":
      return sum(valueExtractor)
    case "count":
      return count() // count() doesn't need a value extractor
    case "avg":
      return avg(valueExtractor)
    case "min":
      return min(valueExtractor)
    case "max":
      return max(valueExtractor)
    default:
      throw new Error(`Unsupported aggregate function: ${aggExpr.name}`)
  }
}

/**
 * Evaluates aggregate functions within a group
 */
export function evaluateAggregateInGroup(
  agg: Agg,
  groupRows: Array<NamespacedRow>
): any {
  const values = groupRows.map((row) => evaluateExpression(agg.args[0]!, row))

  switch (agg.name) {
    case "count":
      return values.length

    case "sum":
      return values.reduce((sum, val) => {
        const num = Number(val)
        return isNaN(num) ? sum : sum + num
      }, 0)

    case "avg":
      const numericValues = values
        .map((v) => Number(v))
        .filter((v) => !isNaN(v))
      return numericValues.length > 0
        ? numericValues.reduce((sum, val) => sum + val, 0) /
            numericValues.length
        : null

    case "min":
      const minValues = values.filter((v) => v != null)
      return minValues.length > 0
        ? Math.min(...minValues.map((v) => Number(v)))
        : null

    case "max":
      const maxValues = values.filter((v) => v != null)
      return maxValues.length > 0
        ? Math.max(...maxValues.map((v) => Number(v)))
        : null

    default:
      throw new Error(`Unknown aggregate function: ${agg.name}`)
  }
}
