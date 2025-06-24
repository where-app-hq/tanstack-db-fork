# Joins

Current syntax:

```ts
useLiveQuery((q) => {
  const issues = q
    .from({ issue: issuesCollection })
    .join({ 
      from: { user: usersCollection },
      type: 'left',
      on: [`@users.id`, `=`, `@issues.userId`],
    })
```

We want to move off the the `@` for references to columns and collections, and the `=` as a comparator is essentially redundant as its the only valid comparator.

If we follow what we have been suggesting for where and select we could do this:

```ts
useLiveQuery((q) => {
  const issues = q
    .from({ issue: issuesCollection })
    .leftJoin(
      { user: usersCollection },
      ({ issue }) => issue.userId,
      ({ user }) => user.id,
    )
```

@thruflo has suggested that `.join` should default to a `leftJoin` as its the most common use case.



# Composable queries

We also need to consider composable queries - I have been thinking along these lines:

```ts
useLiveQuery((q) => {
  const baseQuery = q
    .from({ issue: issuesCollection })
    .where(({ issue }) => issue.projectId === projectId)

  const allAggregate = baseQuery
    .select(({ issue }) => ({
      count: count(issue.id),
      avgDuration: avg(issue.duration)
    }))

  const byStatusAggregate = baseQuery
    .groupBy(({ issue }) => issue.status)
    .select(({ issue }) => ({
      status: issue.status,
      count: count(issue.id),
      avgDuration: avg(issue.duration)

  const firstTenIssues = baseQuery
    .join(
      { user: usersCollection },
      ({ user }) => user.id,
      ({ issue }) => issue.userId,
    )
    .orderBy(({ issue }) => issue.createdAt)
    .limit(10)
    .select(({ issue }) => ({
      id: issue.id,
      title: issue.title,
    }))

  return {
    allAggregate,
    byStatusAggregate,
    firstTenIssues,
  }
, [projectId]);
```

# Defining a query without using it

Often a query my be dined once, and then used multiple times. We need to consider how to handle this.

I think we could acheve this with a `defineLiveQuery` function that takes a callback and returns just the query builder object. This can then be used in the `useLiveQuery` callback.

```ts
const reusableQuery = defineLiveQuery((q) => {
  return q
    .from({ issue: issuesCollection })
    .where(({ issue }) => issue.projectId === projectId)
})

const issues = useLiveQuery(reusableQuery)
```

a defined query could take arguments when used:

```ts
const reusableQuery = defineLiveQuery((q, { projectId }) => {
  return q
    .from({ issue: issuesCollection })
    .where(({ issue }) => issue.projectId === projectId)
})

const issues = useLiveQuery(() => reusableQuery({ projectId })
, [projectId])
```



# Query caching