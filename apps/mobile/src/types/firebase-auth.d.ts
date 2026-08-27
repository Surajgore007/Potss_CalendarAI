import '@firebase/auth';

declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: any): import('@firebase/auth').Persistence;
}

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: any): import('firebase/auth').Persistence;
}
