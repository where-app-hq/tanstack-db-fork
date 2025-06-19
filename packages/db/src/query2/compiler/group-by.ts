import { filter, groupBy, groupByOperators, map } from "@electric-sql/d2mini"
import { evaluateExpression } from "./evaluators.js"
import type { GroupBy, Having, Agg, Select } from "../ir.js"
import type { NamespacedAndKeyedStream, NamespacedRow } from "../../types.js"

const { sum, count, avg, min, max } = groupByOperators

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
  // Create a key extractor function for the groupBy operator
  const keyExtractor = ([_oldKey, namespacedRow]: [
    string,
    NamespacedRow,
  ]) => {
    const key: Record<string, unknown> = {}
    
    // Extract each groupBy expression value
    for (let i = 0; i < groupByClause.length; i++) {
      const expr = groupByClause[i]!
      const value = evaluateExpression(expr, namespacedRow)
      key[`group_${i}`] = value
    }
    
    return key
  }

  // Create aggregate functions for any aggregated columns in the SELECT clause
  const aggregates: Record<string, any> = {}

  if (selectClause) {
    // Scan the SELECT clause for aggregate functions
    for (const [alias, expr] of Object.entries(selectClause)) {
      if (expr.type === "agg") {
        const aggExpr = expr as Agg
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
        const result: Record<string, any> = { ...aggregatedRow }
        
                 // For non-aggregate expressions in SELECT, we need to evaluate them based on the group key
         for (const [alias, expr] of Object.entries(selectClause)) {
           if (expr.type !== "agg") {
             // For non-aggregate expressions, try to extract from the group key
             // Find which group-by expression matches this SELECT expression
             const groupIndex = groupByClause.findIndex(groupExpr => 
               expressionsEqual(expr, groupExpr)
             )
             if (groupIndex >= 0) {
               // Extract value from the key object
               const keyObj = key as Record<string, unknown>
               result[alias] = keyObj[`group_${groupIndex}`]
             } else {
               // If it's not a group-by expression, we can't reliably get it
               // This would typically be an error in SQL
               result[alias] = null
             }
           }
         }
        
        return [key, result] as [string, Record<string, any>]
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
  if (expr1.type !== expr2.type) return false
  
  switch (expr1.type) {
    case "ref":
      return JSON.stringify(expr1.path) === JSON.stringify(expr2.path)
    case "val":
      return expr1.value === expr2.value
    case "func":
      return expr1.name === expr2.name && 
             expr1.args.length === expr2.args.length &&
             expr1.args.every((arg: any, i: number) => expressionsEqual(arg, expr2.args[i]))
    case "agg":
      return expr1.name === expr2.name &&
             expr1.args.length === expr2.args.length &&
             expr1.args.every((arg: any, i: number) => expressionsEqual(arg, expr2.args[i]))
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
    return typeof value === "number" ? value : (value != null ? Number(value) : 0)
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
  const values = groupRows.map(row => evaluateExpression(agg.args[0]!, row))

  switch (agg.name) {
    case "count":
      return values.length

    case "sum":
      return values.reduce((sum, val) => {
        const num = Number(val)
        return isNaN(num) ? sum : sum + num
      }, 0)

    case "avg":
      const numericValues = values.map(v => Number(v)).filter(v => !isNaN(v))
      return numericValues.length > 0 
        ? numericValues.reduce((sum, val) => sum + val, 0) / numericValues.length 
        : null

    case "min":
      const minValues = values.filter(v => v != null)
      return minValues.length > 0 ? Math.min(...minValues.map(v => Number(v))) : null

    case "max":
      const maxValues = values.filter(v => v != null)
      return maxValues.length > 0 ? Math.max(...maxValues.map(v => Number(v))) : null

    default:
      throw new Error(`Unknown aggregate function: ${agg.name}`)
  }
} 