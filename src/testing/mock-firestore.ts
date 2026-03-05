import { of, Observable } from 'rxjs';

export class Firestore {}
export type DocumentReference<T = any> = any;
export type CollectionReference<T = any> = any;
export type DocumentData = any;
export interface DocumentSnapshot<T = any> {
  exists(): boolean;
  data(): T | undefined;
  id: string;
  ref: DocumentReference<T>;
}
export interface QueryDocumentSnapshot<T = any> extends DocumentSnapshot<T> {
  data(): T;
}
export interface QuerySnapshot<T = any> {
  readonly docs: Array<QueryDocumentSnapshot<T>>;
  readonly empty: boolean;
  forEach(callback: (result: QueryDocumentSnapshot<T>) => void, thisArg?: any): void;
}
export type Query<T = any> = any;

export class Timestamp {
  seconds: number;
  nanoseconds: number;
  constructor(seconds: number, nanoseconds: number) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now() {
    return new Timestamp(Math.floor(Date.now() / 1000), 0);
  }
  static fromDate(date: Date) {
    return new Timestamp(Math.floor(date.getTime() / 1000), 0);
  }
  toDate() {
    return new Date(this.seconds * 1000);
  }
  toMillis() {
    return this.seconds * 1000;
  }
}

export const collectionData: <T = any>(query: any, options?: any) => Observable<T[]> = jasmine
  .createSpy('collectionData')
  .and.callFake(() => of([]));

export const docData: <T = any>(ref: any, options?: any) => Observable<T | undefined> = jasmine
  .createSpy('docData')
  .and.callFake(() => of(undefined));

export const collection = jasmine.createSpy('collection').and.returnValue({});
export const doc = jasmine.createSpy('doc').and.returnValue({});

export const getDocs: <T = any>(query: any) => Promise<QuerySnapshot<T>> = jasmine
  .createSpy('getDocs')
  .and.callFake(() => Promise.resolve({ docs: [], empty: true, forEach: () => {} }));

export const getDoc: <T = any>(ref: any) => Promise<DocumentSnapshot<T>> = jasmine
  .createSpy('getDoc')
  .and.callFake(() =>
    Promise.resolve({ exists: () => false, data: () => undefined, id: 'mock-id', ref: {} }),
  );

export const setDoc = jasmine.createSpy('setDoc').and.returnValue(Promise.resolve());
export const updateDoc = jasmine.createSpy('updateDoc').and.returnValue(Promise.resolve());
export const addDoc = jasmine
  .createSpy('addDoc')
  .and.returnValue(Promise.resolve({ id: 'mock-id' }));
export const deleteDoc = jasmine.createSpy('deleteDoc').and.returnValue(Promise.resolve());
export const query = jasmine.createSpy('query').and.returnValue({});
export const where = jasmine.createSpy('where').and.returnValue({});
export const orderBy = jasmine.createSpy('orderBy').and.returnValue({});
export const limit = jasmine.createSpy('limit').and.returnValue({});
export const onSnapshot = jasmine.createSpy('onSnapshot').and.callFake((q: any, callback: any) => {
  if (typeof callback === 'function') {
    callback({ docs: [], docChanges: () => [] });
  }
  return () => {}; // return unsubscribe function
});
export const runTransaction = jasmine
  .createSpy('runTransaction')
  .and.returnValue(Promise.resolve());
export const writeBatch = jasmine.createSpy('writeBatch').and.returnValue({
  set: jasmine.createSpy('batch.set'),
  update: jasmine.createSpy('batch.update'),
  delete: jasmine.createSpy('batch.delete'),
  commit: jasmine.createSpy('batch.commit').and.returnValue(Promise.resolve()),
});
