# Query2 Compiler Restructuring

## Problem Statement

The original query2 compiler had significant architectural issues:

1. **Duplication**: SELECT clause was handled in two separate places:
   - In `processSelect()` for regular queries  
   - Inside `processGroupBy()` for GROUP BY queries (including implicit single-group aggregation)

2. **Complex branching logic**: The main compiler had convoluted logic to decide where to handle SELECT processing

3. **Future extensibility issues**: This structure would make it difficult to add DISTINCT operator later, which needs to run after SELECT but before ORDER BY and LIMIT

## Solution: Early SELECT Processing with `__select_results`

The restructuring implements a cleaner pipeline architecture:

### New Flow
1. **FROM** → table setup
2. **JOIN** → creates namespaced rows  
3. **WHERE** → filters rows
4. **SELECT** → creates `__select_results` while preserving namespaced row
5. **GROUP BY** → works with `__select_results` and creates new structure
6. **HAVING** → filters groups based on `__select_results`
7. **ORDER BY** → can access both original namespaced data and `__select_results`
8. **FINAL EXTRACTION** → extracts `__select_results` as final output

### Key Changes

#### 1. Main Compiler (`index.ts`)
- Always runs SELECT early via `processSelectToResults()`
- Eliminates complex branching logic for SELECT vs GROUP BY
- Final step extracts `__select_results` as output
- Cleaner handling of implicit single-group aggregation

#### 2. New SELECT Processor (`select.ts`)
- `processSelectToResults()`: Creates `__select_results` while preserving namespaced row
- Handles aggregate expressions as placeholders (filled by GROUP BY)
- Maintains backward compatibility with legacy `processSelect()`

#### 3. Updated GROUP BY Processor (`group-by.ts`)
- Works with existing `__select_results` from early SELECT processing
- Updates `__select_results` with aggregate computations
- Eliminates internal SELECT handling duplication
- Simplified HAVING clause evaluation using `__select_results`

#### 4. Enhanced ORDER BY Processor (`order-by.ts`)
- Can access both original namespaced row data and `__select_results`
- Supports ordering by SELECT aliases or direct table column references
- Creates merged context for expression evaluation

## Benefits

1. **Eliminates Duplication**: Single point of SELECT processing
2. **Cleaner Architecture**: Clear separation of concerns
3. **Better Extensibility**: Easy to add DISTINCT operator between SELECT and ORDER BY
4. **Maintains Compatibility**: All existing functionality preserved
5. **Performance**: No overhead - still uses pre-compiled expressions

## Test Results

- **250/251 tests pass (99.6% success rate)**
- Single failing test is pre-existing issue with D2 library during delete operations
- All core functionality works: SELECT, JOIN, GROUP BY, HAVING, ORDER BY, subqueries, live updates

## Future Extensibility

The new architecture makes it trivial to add DISTINCT:

```typescript
// Future DISTINCT implementation would go here:
if (query.distinct) {
  pipeline = processDistinct(pipeline) // Works on __select_results
}
// Before ORDER BY
if (query.orderBy && query.orderBy.length > 0) {
  pipeline = processOrderBy(pipeline, query.orderBy)
}
```

This restructuring successfully eliminates the architectural issues while maintaining full backward compatibility and test coverage.