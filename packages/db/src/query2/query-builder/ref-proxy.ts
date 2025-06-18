import { Ref, Value, type Expression } from '../ir.js'

export interface RefProxy<T = any> {
  readonly __refProxy: true
  readonly __path: string[]
  readonly __type: T
}

/**
 * Creates a proxy object that records property access paths
 * Used in callbacks like where, select, etc. to create type-safe references
 */
export function createRefProxy<T extends Record<string, any>>(
  aliases: string[]
): RefProxy<T> & T {
  const cache = new Map<string, any>()
  
  function createProxy(path: string[]): any {
    const pathKey = path.join('.')
    if (cache.has(pathKey)) {
      return cache.get(pathKey)
    }

    const proxy = new Proxy({} as any, {
      get(target, prop, receiver) {
        if (prop === '__refProxy') return true
        if (prop === '__path') return path
        if (prop === '__type') return undefined // Type is only for TypeScript inference
        if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
        
        const newPath = [...path, String(prop)]
        return createProxy(newPath)
      },
      
      has(target, prop) {
        if (prop === '__refProxy' || prop === '__path' || prop === '__type') return true
        return Reflect.has(target, prop)
      },
      
      ownKeys(target) {
        return Reflect.ownKeys(target)
      },
      
      getOwnPropertyDescriptor(target, prop) {
        if (prop === '__refProxy' || prop === '__path' || prop === '__type') {
          return { enumerable: false, configurable: true }
        }
        return Reflect.getOwnPropertyDescriptor(target, prop)
      }
    })
    
    cache.set(pathKey, proxy)
    return proxy
  }

  // Create the root proxy with all aliases as top-level properties
  const rootProxy = new Proxy({} as any, {
    get(target, prop, receiver) {
      if (prop === '__refProxy') return true
      if (prop === '__path') return []
      if (prop === '__type') return undefined // Type is only for TypeScript inference
      if (typeof prop === 'symbol') return Reflect.get(target, prop, receiver)
      
      const propStr = String(prop)
      if (aliases.includes(propStr)) {
        return createProxy([propStr])
      }
      
      return undefined
    },
    
    has(target, prop) {
      if (prop === '__refProxy' || prop === '__path' || prop === '__type') return true
      if (typeof prop === 'string' && aliases.includes(prop)) return true
      return Reflect.has(target, prop)
    },
    
    ownKeys(target) {
      return [...aliases, '__refProxy', '__path', '__type']
    },
    
    getOwnPropertyDescriptor(target, prop) {
      if (prop === '__refProxy' || prop === '__path' || prop === '__type') {
        return { enumerable: false, configurable: true }
      }
      if (typeof prop === 'string' && aliases.includes(prop)) {
        return { enumerable: true, configurable: true }
      }
      return undefined
    }
  })

  return rootProxy
}

/**
 * Converts a value to an Expression
 * If it's a RefProxy, creates a Ref, otherwise creates a Value
 */
export function toExpression(value: any): Expression {
  if (isRefProxy(value)) {
    return new Ref(value.__path)
  }
  return new Value(value)
}

/**
 * Type guard to check if a value is a RefProxy
 */
export function isRefProxy(value: any): value is RefProxy {
  return value && typeof value === 'object' && value.__refProxy === true
}

/**
 * Helper to create a Value expression from a literal
 */
export function val(value: any): Expression {
  return new Value(value)
}
