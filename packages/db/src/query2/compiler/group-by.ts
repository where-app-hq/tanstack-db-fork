import { filter, groupBy, groupByOperators, map } from "@electric-sql/d2mini"
import { Func, Ref } from "../ir.js"
import { compileExpression } from "./evaluators.js"
import type { Agg, Expression, GroupBy, Having, Select } from "../ir.js"
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
    if (expr.type === `agg`) {
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
 * Processes the GROUP BY clause with optional HAVING and SELECT
 * Works with the new __select_results structure from early SELECT processing
 */
export function processGroupBy(
  pipeline: NamespacedAndKeyedStream,
  groupByClause: GroupBy,
  havingClause?: Having,
  selectClause?: Select
): NamespacedAndKeyedStream {
  // Handle empty GROUP BY (single-group aggregation)
  if (groupByClause.length === 0) {
    // For single-group aggregation, create a single group with all data
    const aggregates: Record<string, any> = {}

    if (selectClause) {
      // Scan the SELECT clause for aggregate functions
      for (const [alias, expr] of Object.entries(selectClause)) {
        if (expr.type === `agg`) {
          const aggExpr = expr
          aggregates[alias] = getAggregateFunction(aggExpr)
        }
      }
    }

    // Use a constant key for single group
    const keyExtractor = () => ({ __singleGroup: true })

    // Apply the groupBy operator with single group
    pipeline = pipeline.pipe(
      groupBy(keyExtractor, aggregates)
    ) as NamespacedAndKeyedStream

    // Update __select_results to include aggregate values
    pipeline = pipeline.pipe(
      map(([, aggregatedRow]) => {
        // Start with the existing __select_results from early SELECT processing
        const selectResults = (aggregatedRow as any).__select_results || {}
        const finalResults: Record<string, any> = { ...selectResults }

        if (selectClause) {
          // Update with aggregate results
          for (const [alias, expr] of Object.entries(selectClause)) {
            if (expr.type === `agg`) {
              finalResults[alias] = aggregatedRow[alias]
            }
            // Non-aggregates keep their original values from early SELECT processing
          }
        }

        // Use a single key for the result and update __select_results
        return [
          `single_group`,
          {
            ...aggregatedRow,
            __select_results: finalResults,
          },
        ] as [unknown, Record<string, any>]
      })
    )

    // Apply HAVING clause if present
    if (havingClause) {
      const transformedHavingClause = transformHavingClause(
        havingClause,
        selectClause || {}
      )
      const compiledHaving = compileExpression(transformedHavingClause)

      pipeline = pipeline.pipe(
        filter(([, row]) => {
          // Create a namespaced row structure for HAVING evaluation
          const namespacedRow = { result: (row as any).__select_results }
          return compiledHaving(namespacedRow)
        })
      )
    }

    return pipeline
  }

  // Multi-group aggregation logic...
  // Validate and create mapping for non-aggregate expressions in SELECT
  const mapping = validateAndCreateMapping(groupByClause, selectClause)

  // Pre-compile groupBy expressions
  const compiledGroupByExpressions = groupByClause.map(compileExpression)

  // Create a key extractor function using simple __key_X format
  const keyExtractor = ([, row]: [
    string,
    NamespacedRow & { __select_results?: any },
  ]) => {
    // Use the original namespaced row for GROUP BY expressions, not __select_results
    const namespacedRow = { ...row }
    delete (namespacedRow as any).__select_results

    const key: Record<string, unknown> = {}

    // Use simple __key_X format for each groupBy expression
    for (let i = 0; i < groupByClause.length; i++) {
      const compiledExpr = compiledGroupByExpressions[i]!
      const value = compiledExpr(namespacedRow)
      key[`__key_${i}`] = value
    }

    return key
  }

  // Create aggregate functions for any aggregated columns in the SELECT clause
  const aggregates: Record<string, any> = {}

  if (selectClause) {
    // Scan the SELECT clause for aggregate functions
    for (const [alias, expr] of Object.entries(selectClause)) {
      if (expr.type === `agg`) {
        const aggExpr = expr
        aggregates[alias] = getAggregateFunction(aggExpr)
      }
    }
  }

  // Apply the groupBy operator
  pipeline = pipeline.pipe(groupBy(keyExtractor, aggregates))

  // Update __select_results to handle GROUP BY results
  pipeline = pipeline.pipe(
    map(([, aggregatedRow]) => {
      // Start with the existing __select_results from early SELECT processing
      const selectResults = (aggregatedRow as any).__select_results || {}
      const finalResults: Record<string, any> = {}

      if (selectClause) {
        // Process each SELECT expression
        for (const [alias, expr] of Object.entries(selectClause)) {
          if (expr.type !== `agg`) {
            // Use cached mapping to get the corresponding __key_X for non-aggregates
            const groupIndex = mapping.selectToGroupByIndex.get(alias)
            if (groupIndex !== undefined) {
              finalResults[alias] = aggregatedRow[`__key_${groupIndex}`]
            } else {
              // Fallback to original SELECT results
              finalResults[alias] = selectResults[alias]
            }
          } else {
            // Use aggregate results
            finalResults[alias] = aggregatedRow[alias]
          }
        }
      } else {
        // No SELECT clause - just use the group keys
        for (let i = 0; i < groupByClause.length; i++) {
          finalResults[`__key_${i}`] = aggregatedRow[`__key_${i}`]
        }
      }

      // Generate a simple key for the live collection using group values
      let finalKey: unknown
      if (groupByClause.length === 1) {
        finalKey = aggregatedRow[`__key_0`]
      } else {
        const keyParts: Array<unknown> = []
        for (let i = 0; i < groupByClause.length; i++) {
          keyParts.push(aggregatedRow[`__key_${i}`])
        }
        finalKey = JSON.stringify(keyParts)
      }

      return [
        finalKey,
        {
          ...aggregatedRow,
          __select_results: finalResults,
        },
      ] as [unknown, Record<string, any>]
    })
  )

  // Apply HAVING clause if present
  if (havingClause) {
    const transformedHavingClause = transformHavingClause(
      havingClause,
      selectClause || {}
    )
    const compiledHaving = compileExpression(transformedHavingClause)

    pipeline = pipeline.pipe(
      filter(([, row]) => {
        // Create a namespaced row structure for HAVING evaluation
        const namespacedRow = { result: (row as any).__select_results }
        return compiledHaving(namespacedRow)
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
    case `ref`:
      // Compare paths as arrays
      if (!expr1.path || !expr2.path) return false
      if (expr1.path.length !== expr2.path.length) return false
      return expr1.path.every(
        (segment: string, i: number) => segment === expr2.path[i]
      )
    case `val`:
      return expr1.value === expr2.value
    case `func`:
      return (
        expr1.name === expr2.name &&
        expr1.args?.length === expr2.args?.length &&
        (expr1.args || []).every((arg: any, i: number) =>
          expressionsEqual(arg, expr2.args[i])
        )
      )
    case `agg`:
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
  // Pre-compile the value extractor expression
  const compiledExpr = compileExpression(aggExpr.args[0]!)

  // Create a value extractor function for the expression to aggregate
  const valueExtractor = ([, namespacedRow]: [string, NamespacedRow]) => {
    const value = compiledExpr(namespacedRow)
    // Ensure we return a number for numeric aggregate functions
    return typeof value === `number` ? value : value != null ? Number(value) : 0
  }

  // Return the appropriate aggregate function
  switch (aggExpr.name.toLowerCase()) {
    case `sum`:
      return sum(valueExtractor)
    case `count`:
      return count() // count() doesn't need a value extractor
    case `avg`:
      return avg(valueExtractor)
    case `min`:
      return min(valueExtractor)
    case `max`:
      return max(valueExtractor)
    default:
      throw new Error(`Unsupported aggregate function: ${aggExpr.name}`)
  }
}

/**
 * Transforms a HAVING clause to replace Agg expressions with references to computed values
 */
function transformHavingClause(
  havingExpr: Expression | Agg,
  selectClause: Select
): Expression {
  switch (havingExpr.type) {
    case `agg`: {
      const aggExpr = havingExpr
      // Find matching aggregate in SELECT clause
      for (const [alias, selectExpr] of Object.entries(selectClause)) {
        if (selectExpr.type === `agg` && aggregatesEqual(aggExpr, selectExpr)) {
          // Replace with a reference to the computed aggregate
          return new Ref([`result`, alias])
        }
      }
      // If no matching aggregate found in SELECT, throw error
      throw new Error(
        `Aggregate function in HAVING clause must also be in SELECT clause: ${aggExpr.name}`
      )
    }

    case `func`: {
      const funcExpr = havingExpr
      // Transform function arguments recursively
      const transformedArgs = funcExpr.args.map((arg: Expression | Agg) =>
        transformHavingClause(arg, selectClause)
      )
      return new Func(funcExpr.name, transformedArgs)
    }

    case `ref`: {
      const refExpr = havingExpr
      // Check if this is a direct reference to a SELECT alias
      if (refExpr.path.length === 1) {
        const alias = refExpr.path[0]!
        if (selectClause[alias]) {
          // This is a reference to a SELECT alias, convert to result.alias
          return new Ref([`result`, alias])
        }
      }
      // Return as-is for other refs
      return havingExpr as Expression
    }

    case `val`:
      // Return as-is
      return havingExpr as Expression

    default:
      throw new Error(
        `Unknown expression type in HAVING clause: ${(havingExpr as any).type}`
      )
  }
}

/**
 * Checks if two aggregate expressions are equal
 */
function aggregatesEqual(agg1: Agg, agg2: Agg): boolean {
  if (agg1.name !== agg2.name) return false
  if (agg1.args.length !== agg2.args.length) return false
  return agg1.args.every((arg, i) => expressionsEqual(arg, agg2.args[i]))
}
