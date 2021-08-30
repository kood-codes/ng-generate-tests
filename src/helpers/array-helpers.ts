export function flatten<T, R>(arr: Array<T>, mapper: (a: T) => Array<R>): Array<R> {
  return arr.map(mapper).reduce((acc, val) => acc.concat(val), []);
}

export function diffArray<T>(arr1: Array<T>, arr2: Array<T>) {
  return arr1.filter(val => !arr2.includes(val));
}

export const isObjectTruthy = <T, K extends keyof T>(obj: T): boolean => {
  return Object.keys(obj).some(key => !!obj[key as K]);
};