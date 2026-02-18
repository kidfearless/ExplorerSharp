
/**
 * Wraps an Array, Set, Map, NodeList, HTMLCollection or any Iterable<T>
 * into your LINQ‑style Enumerable<T>.
 */
export function linq<T>(source?: SupportedCollections<T> | null | undefined): Enumerable<T>
{
	if (source === null || source === undefined)
	{
		return new Enumerable<T>([]);
	}
	let iter: Iterable<T>;
	if (isIterable<T>(source))
	{
		// Array, Set, Map, or any Iterable<T>
		if (source instanceof Map)
		{
			// by default LINQ on Map<T> should enumerate values
			iter = source.values();
		} else
		{
			iter = source;
		}
	}
	else
	{
		// NodeList, HTMLCollection, or other array‑like
		iter = arrayLikeToIterable(source as ArrayLikeCollections<T>);
	}
	return new Enumerable<T>(iter);
}
type ArrayLikeCollections<T> =
	// @ts-ignore
	| NodeListOf<T>
	// @ts-ignore
	| HTMLCollectionOf<T>
	| { readonly length: number;[idx: number]: T };
type SupportedCollections<T> =
	| T[]
	| Set<T>
	| Map<any, T>        // iterates over Map values by default
	| Iterable<T>
	| ArrayLikeCollections<T>;
function isIterable<T>(obj: any): obj is Iterable<T>
{
	return obj != null && typeof obj[Symbol.iterator] === 'function';
}
function arrayLikeToIterable<T>(arr: ArrayLikeCollections<T>): Iterable<T>
{
	return {
		[Symbol.iterator](): Iterator<T>
		{
			let index = 0;
			return {
				next(): IteratorResult<T>
				{
					if (index < arr.length)
					{
						return { value: arr[index++], done: false };
					}
					return { value: undefined as any, done: true };
				}
			};
		}
	};
}

type KeyComparer<K> = (a: K, b: K) => number;
type ItemComparer<T> = (a: T, b: T) => number;

function defaultCompare<K>(a: K, b: K): number
{
	return a < b ? -1 : a > b ? 1 : 0;
}

function stableSort<T>(items: Iterable<T>, comparer: ItemComparer<T>): T[]
{
	const indexed = Array.from(items).map((value, index) => ({ value, index }));
	indexed.sort((a, b) =>
	{
		const result = comparer(a.value, b.value);
		if (result !== 0)
		{
			return result;
		}
		return a.index - b.index;
	});
	return indexed.map((x) => x.value);
}

function createKeyComparer<T, K>(
	keySelector: (item: T) => K,
	comparer?: KeyComparer<K>,
	descending = false,
): ItemComparer<T>
{
	return (a: T, b: T) =>
	{
		const ak = keySelector(a);
		const bk = keySelector(b);
		const keyComparer = comparer ?? defaultCompare<K>;
		const result = keyComparer(ak, bk);
		return descending ? -result : result;
	};
}

// Enumerable.ts
export class Enumerable<T = unknown> implements Iterable<T>
{
	public get value(): T[]
	{
		return this.toArray();
	}
	private readonly source: Iterable<T>;
	private cachedArray: T[] | null = null;
	constructor(source: Iterable<T>)
	{
		this.source = source;
	}
	[Symbol.iterator](): Iterator<T>
	{
		if (this.cachedArray !== null)
		{
			return this.cachedArray[Symbol.iterator]();
		}
		return this.source[Symbol.iterator]();
	}
	private materialize(): void
	{
		if (this.cachedArray === null)
		{
			this.cachedArray = Array.from(this.source);
		}
	}
	static empty<U>(): Enumerable<U>
	{
		return new Enumerable<U>([]);
	}
	static from<T>(...source: T[]): Enumerable<T>
	{
		let iter: Iterable<T>;
		if (isIterable<T>(source))
		{
			// Array, Set, Map, or any Iterable<T>
			if (source instanceof Map)
			{
				// by default LINQ on Map<T> should enumerate values
				iter = source.values();
			} else
			{
				iter = source;
			}
		} else
		{
			// NodeList, HTMLCollection, or other array‑like
			iter = arrayLikeToIterable(source as ArrayLikeCollections<T>);
		}
		return new Enumerable<T>(iter);
	}
	ofType<U>(type: { new(): U; prototype: U; }): Enumerable<U>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<U>
			{
				const iterator = self[Symbol.iterator]();
				return {
					next(): IteratorResult<U>
					{
						while (true)
						{
							const result = iterator.next();
							if (result.done) return { value: undefined as any, done: true };
							if (result.value instanceof type) return { value: result.value as U, done: false };
						}
					}
				};
			}
		});
	}
	// -- Transformation --
	where(predicate: (item: T, index: number) => boolean): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const iterator = self[Symbol.iterator]();
				let index = 0;
				return {
					next(): IteratorResult<T>
					{
						while (true)
						{
							const result = iterator.next();
							if (result.done) return { value: undefined as any, done: true };
							if (predicate(result.value, index++)) return { value: result.value, done: false };
						}
					}
				};
			}
		});
	}
	index(): Enumerable<readonly [T, number]>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<readonly [T, number]>
			{
				const iterator = self[Symbol.iterator]();
				let index = 0;
				return {
					next(): IteratorResult<readonly [T, number]>
					{
						const result = iterator.next();
						if (result.done) return { value: undefined as any, done: true };
						return { value: [result.value, index++] as const, done: false };
					}
				};
			}
		});
	}
	select<U>(selector: (item: T, index: number) => U): Enumerable<U>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<U>
			{
				const iterator = self[Symbol.iterator]();
				let index = 0;
				return {
					next(): IteratorResult<U>
					{
						const result = iterator.next();
						if (result.done) return { value: undefined as any, done: true };
						return { value: selector(result.value, index++), done: false };
					}
				};
			}
		});
	}
	convertAll<U>(selector: (item: T, index: number) => U): U[]
	{
		const result: U[] = [];
		let index = 0;
		for (const x of this)
		{
			result.push(selector(x, index++));
		}
		return result;
	}
	selectMany<U>(selector: (item: T, index: number) => Iterable<U>): Enumerable<U>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<U>
			{
				const outerIterator = self[Symbol.iterator]();
				let innerIterator: Iterator<U> | null = null;
				let index = 0;
				return {
					next(): IteratorResult<U>
					{
						while (true)
						{
							if (innerIterator)
							{
								const innerResult = innerIterator.next();
								if (!innerResult.done) return innerResult;
								innerIterator = null;
							}
							const outerResult = outerIterator.next();
							if (outerResult.done) return { value: undefined as any, done: true };
							const innerIterable = selector(outerResult.value, index++);
							innerIterator = innerIterable[Symbol.iterator]();
						}
					}
				};
			}
		});
	}
	concat(...other: T[]): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const firstIterator = self[Symbol.iterator]();
				const secondIterator = other[Symbol.iterator]();
				let useFirst = true;
				return {
					next(): IteratorResult<T>
					{
						if (useFirst)
						{
							const result = firstIterator.next();
							if (!result.done) return result;
							useFirst = false;
						}
						return secondIterator.next();
					}
				};
			}
		});
	}
	defaultIfEmpty(defaultValue: T): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const iterator = self[Symbol.iterator]();
				let empty = true;
				let done = false;
				return {
					next(): IteratorResult<T>
					{
						if (done) return { value: undefined as any, done: true };
						const result = iterator.next();
						if (!result.done)
						{
							empty = false;
							return result;
						}
						if (empty)
						{
							done = true;
							return { value: defaultValue, done: false };
						}
						return { value: undefined as any, done: true };
					}
				};
			}
		});
	}
	distinct<K = T>(keySelector?: (item: T) => K): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const iterator = self[Symbol.iterator]();
				const seen = new Set<K>();
				return {
					next(): IteratorResult<T>
					{
						while (true)
						{
							const result = iterator.next();
							if (result.done) return { value: undefined as any, done: true };
							const key = keySelector ? keySelector(result.value) : (result.value as unknown as K);
							if (!seen.has(key))
							{
								seen.add(key);
								return { value: result.value, done: false };
							}
						}
					}
				};
			}
		});
	}
	union(other: Iterable<T>, keySelector?: (item: T) => any): Enumerable<T>
	{
		return this.concat(...other).distinct(keySelector);
	}
	intersect(other: Iterable<T>, keySelector?: (item: T) => any): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const setB = new Set<any>();
				for (const y of other)
				{
					setB.add(keySelector ? keySelector(y) : y);
				}
				const yielded = new Set<any>();
				const iterator = self[Symbol.iterator]();
				return {
					next(): IteratorResult<T>
					{
						while (true)
						{
							const result = iterator.next();
							if (result.done) return { value: undefined as any, done: true };
							const key = keySelector ? keySelector(result.value) : result.value;
							if (setB.has(key) && !yielded.has(key))
							{
								yielded.add(key);
								return { value: result.value, done: false };
							}
						}
					}
				};
			}
		});
	}
	except(other: Iterable<T>, keySelector?: (item: T) => any): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const setB = new Set<any>();
				for (const y of other)
				{
					setB.add(keySelector ? keySelector(y) : y);
				}
				const iterator = self[Symbol.iterator]();
				return {
					next(): IteratorResult<T>
					{
						while (true)
						{
							const result = iterator.next();
							if (result.done) return { value: undefined as any, done: true };
							const key = keySelector ? keySelector(result.value) : result.value;
							if (!setB.has(key)) return { value: result.value, done: false };
						}
					}
				};
			}
		});
	}
	zip<U, R>(other: Iterable<U>, resultSelector: (a: T, b: U) => R): Enumerable<R>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<R>
			{
				const iteratorA = self[Symbol.iterator]();
				const iteratorB = other[Symbol.iterator]();
				return {
					next(): IteratorResult<R>
					{
						const resultA = iteratorA.next();
						const resultB = iteratorB.next();
						if (resultA.done || resultB.done) return { value: undefined as any, done: true };
						return { value: resultSelector(resultA.value, resultB.value), done: false };
					}
				};
			}
		});
	}
	// -- Filtering --
	skip(count: number): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const iterator = self[Symbol.iterator]();
				let index = 0;
				return {
					next(): IteratorResult<T>
					{
						while (true)
						{
							const result = iterator.next();
							if (result.done) return { value: undefined as any, done: true };
							if (index++ >= count) return { value: result.value, done: false };
						}
					}
				};
			}
		});
	}
	take(count: number): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const iterator = self[Symbol.iterator]();
				let index = 0;
				return {
					next(): IteratorResult<T>
					{
						if (index >= count) return { value: undefined as any, done: true };
						const result = iterator.next();
						if (result.done) return { value: undefined as any, done: true };
						index++;
						return { value: result.value, done: false };
					}
				};
			}
		});
	}
	skipWhile(predicate: (item: T, index: number) => boolean): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const iterator = self[Symbol.iterator]();
				let index = 0;
				let yielding = false;
				return {
					next(): IteratorResult<T>
					{
						while (true)
						{
							const result = iterator.next();
							if (result.done) return { value: undefined as any, done: true };
							if (!yielding && !predicate(result.value, index++))
							{
								yielding = true;
							}
							if (yielding) return { value: result.value, done: false };
						}
					}
				};
			}
		});
	}
	takeWhile(predicate: (item: T, index: number) => boolean): Enumerable<T>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<T>
			{
				const iterator = self[Symbol.iterator]();
				let index = 0;
				let done = false;
				return {
					next(): IteratorResult<T>
					{
						if (done) return { value: undefined as any, done: true };
						const result = iterator.next();
						if (result.done) return { value: undefined as any, done: true };
						if (!predicate(result.value, index++))
						{
							done = true;
							return { value: undefined as any, done: true };
						}
						return { value: result.value, done: false };
					}
				};
			}
		});
	}
	// -- Projection to arrays / maps --
	toArray(): T[]
	{
		this.materialize();
		return this.cachedArray!.slice();
	}

	toList(): T[]
	{
		this.materialize();
		return this.cachedArray!.slice();
	}

	toMap<K, V = T>(keySelector: (item: T) => K, elementSelector?: (item: T) => V): Map<K, V>
	{
		const m = new Map<K, V>();
		for (const x of this)
		{
			m.set(keySelector(x), elementSelector ? elementSelector(x) : (x as unknown as V));
		}
		return m;
	}
	toDictionary<K, V = T>(keySelector: (item: T) => K, elementSelector?: (item: T) => V): Record<string, V>
	{
		const obj: Record<string, V> = {};
		for (const x of this)
		{
			const k = keySelector(x);
			obj[String(k)] = elementSelector ? elementSelector(x) : (x as unknown as V);
		}
		return obj;
	}
	// -- Aggregation --
	aggregate<U>(seed: U, func: (acc: U, item: T) => U): U
	{
		let acc = seed;
		for (const x of this)
		{
			acc = func(acc, x);
		}
		return acc;
	}
	count(predicate?: (item: T) => boolean): number
	{
		let cnt = 0;
		if (predicate)
		{
			for (const x of this)
			{
				if (predicate(x)) cnt++;
			}
		} else
		{
			for (const _ of this) cnt++;
		}
		return cnt;
	}
	any(predicate?: (item: T) => boolean): boolean
	{
		if (predicate)
		{
			for (const x of this) if (predicate(x)) return true;
			return false;
		}
		else
		{
			for (const _ of this) return true;
			return false;
		}
	}
	all(predicate: (item: T) => boolean): boolean
	{
		for (const x of this)
		{
			if (!predicate(x)) return false;
		}
		return true;
	}
	sum(this: Enumerable<number>): number
	{
		let total = 0;
		for (const x of this) total += x;
		return total;
	}
	average(this: Enumerable<number>): number
	{
		let total = 0,
			cnt = 0;
		for (const x of this)
		{
			total += x;
			cnt++;
		}
		return cnt === 0 ? NaN : total / cnt;
	}
	min(this: Enumerable<number>): number
	{
		let minVal: number | null = null;
		for (const x of this)
		{
			if (minVal === null || x < minVal) minVal = x;
		}
		if (minVal === null) throw new Error('Sequence contains no elements');
		return minVal;
	}
	max(this: Enumerable<number>): number
	{
		let maxVal: number | null = null;
		for (const x of this)
		{
			if (maxVal === null || x > maxVal) maxVal = x;
		}
		if (maxVal === null) throw new Error('Sequence contains no elements');
		return maxVal;
	}
	// -- Element operations --
	contains(value: T): boolean
	{
		for (const x of this)
		{
			if (x === value) return true;
		}
		return false;
	}
	first(predicate?: (item: T) => boolean): T
	{
		if (predicate)
		{
			for (const x of this) if (predicate(x)) return x;
		} else
		{
			for (const x of this) return x;
		}
		throw new Error('No matching element');
	}
	firstOrDefault(predicate?: (item: T) => boolean, defaultValue?: T): T | undefined
	{
		try
		{
			return this.first(predicate!);
		} catch
		{
			return defaultValue;
		}
	}
	last(predicate?: (item: T) => boolean): T
	{
		let found: T | undefined;
		let any = false;
		if (predicate)
		{
			for (const x of this)
			{
				if (predicate(x))
				{
					any = true;
					found = x;
				}
			}
		} else
		{
			for (const x of this)
			{
				any = true;
				found = x;
			}
		}
		if (!any) throw new Error('No matching element');
		return found!;
	}
	lastOrDefault(predicate?: (item: T) => boolean, defaultValue?: T): T | undefined
	{
		try
		{
			return this.last(predicate!);
		} catch
		{
			return defaultValue;
		}
	}
	single(predicate?: (item: T) => boolean): T
	{
		let found: T | undefined;
		let cnt = 0;
		if (predicate)
		{
			for (const x of this)
			{
				if (predicate(x))
				{
					found = x;
					cnt++;
				}
			}
		} else
		{
			for (const x of this)
			{
				found = x;
				cnt++;
			}
		}
		if (cnt === 0) throw new Error('No matching element');
		if (cnt > 1) throw new Error('More than one matching element');
		return found!;
	}
	singleOrDefault(predicate?: (item: T) => boolean, defaultValue?: T): T | undefined
	{
		try
		{
			return this.single(predicate!);
		} catch
		{
			return defaultValue;
		}
	}
	elementAt(index: number): T
	{
		if (index < 0) throw new Error('Index out of range');
		let i = 0;
		for (const x of this)
		{
			if (i++ === index) return x;
		}
		throw new Error('Index out of range');
	}
	elementAtOrDefault(index: number, defaultValue?: T): T | undefined
	{
		try
		{
			return this.elementAt(index);
		} catch
		{
			return defaultValue;
		}
	}
	// -- Ordering --
	orderBy<K>(keySelector: (item: T) => K, comparer?: (a: K, b: K) => number): OrderedEnumerable<T>
	{
		return new OrderedEnumerable(this, createKeyComparer(keySelector, comparer, false));
	}
	orderByDescending<K>(keySelector: (item: T) => K, comparer?: (a: K, b: K) => number): OrderedEnumerable<T>
	{
		return new OrderedEnumerable(this, createKeyComparer(keySelector, comparer, true));
	}
	reverse(): Enumerable<T>
	{
		const arr = Array.from(this);
		arr.reverse();
		return new Enumerable(arr);
	}
	// -- Join & Group --
	join<U, K, R>(inner: Iterable<U>, outerKeySelector: (outer: T) => K, innerKeySelector: (inner: U) => K, resultSelector: (outer: T, inner: U) => R): Enumerable<R>
	{
		const self = this;
		return new Enumerable({
			[Symbol.iterator](): Iterator<R>
			{
				const map = new Map<K, U[]>();
				for (const y of inner)
				{
					const key = innerKeySelector(y);
					if (!map.has(key)) map.set(key, []);
					map.get(key)!.push(y);
				}
				const outerIterator = self[Symbol.iterator]();
				let currentOuter: T | null = null;
				let currentMatches: U[] = [];
				let matchIndex = 0;
				return {
					next(): IteratorResult<R>
					{
						while (true)
						{
							if (currentOuter !== null && matchIndex < currentMatches.length)
							{
								return { value: resultSelector(currentOuter, currentMatches[matchIndex++]), done: false };
							}
							const outerResult = outerIterator.next();
							if (outerResult.done) return { value: undefined as any, done: true };
							currentOuter = outerResult.value;
							const key = outerKeySelector(currentOuter);
							currentMatches = map.get(key) || [];
							matchIndex = 0;
						}
					}
				};
			}
		});
	}
	groupBy<K, E = T>(keySelector: (item: T) => K, elementSelector?: (item: T) => E): Enumerable<Grouping<K, E>>
	{
		const map = new Map<K, E[]>();
		for (const x of this)
		{
			const key = keySelector(x);
			const element = elementSelector ? elementSelector(x) : (x as unknown as E);
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(element);
		}
		return new Enumerable({
			[Symbol.iterator](): Iterator<Grouping<K, E>>
			{
				const mapIterator = map[Symbol.iterator]();
				return {
					next(): IteratorResult<Grouping<K, E>>
					{
						const result = mapIterator.next();
						if (result.done) return { value: undefined as any, done: true };
						const [key, values] = result.value;
						return { value: new Grouping(key, values), done: false };
					}
				};
			}
		});
	}
	// -- Equality --
	sequenceEqual(other: Iterable<T>, comparer?: (a: T, b: T) => boolean): boolean
	{
		const itA = this[Symbol.iterator]();
		const itB = other[Symbol.iterator]();
		while (true)
		{
			const a = itA.next();
			const b = itB.next();
			if (a.done && b.done) return true;
			if (a.done !== b.done) return false;
			const eq = comparer ? comparer(a.value, b.value) : a.value === b.value;
			if (!eq) return false;
		}
	}
	// Add to the Enumerable class:
	/**
	 * Casts the elements of an Enumerable to the specified type.
	 * This is a type conversion operation and doesn't actually perform any runtime conversion.
	 * 
	 * @template U The type to cast to
	 * @returns A new Enumerable with elements cast to the specified type
	 */
	cast<U>(): Enumerable<U>
	{
		return new Enumerable<U>(this as unknown as Iterable<U>);
	}
	// -- Side effects --
	forEach(action: (item: T, index: number) => void): void
	{
		let i = 0;
		for (const x of this)
		{
			action(x, i++);
		}
	}
}

export class OrderedEnumerable<T> extends Enumerable<T>
{
	private readonly orderedSource: Iterable<T>;
	private readonly comparer: ItemComparer<T>;

	constructor(source: Iterable<T>, comparer: ItemComparer<T>)
	{
		super(source);
		this.orderedSource = source;
		this.comparer = comparer;
	}

	[Symbol.iterator](): Iterator<T>
	{
		return stableSort(this.orderedSource, this.comparer)[Symbol.iterator]();
	}

	thenBy<K>(keySelector: (item: T) => K, comparer?: KeyComparer<K>): OrderedEnumerable<T>
	{
		const nextComparer = createKeyComparer(keySelector, comparer, false);
		const composed: ItemComparer<T> = (a, b) =>
		{
			const result = this.comparer(a, b);
			if (result !== 0)
			{
				return result;
			}
			return nextComparer(a, b);
		};
		return new OrderedEnumerable(this, composed);
	}

	thenByDescending<K>(keySelector: (item: T) => K, comparer?: KeyComparer<K>): OrderedEnumerable<T>
	{
		const nextComparer = createKeyComparer(keySelector, comparer, true);
		const composed: ItemComparer<T> = (a, b) =>
		{
			const result = this.comparer(a, b);
			if (result !== 0)
			{
				return result;
			}
			return nextComparer(a, b);
		};
		return new OrderedEnumerable(this, composed);
	}
}
// Helper for GroupBy
export class Grouping<K, V> extends Enumerable<V>
{
	constructor(public readonly key: K, values: Iterable<V>)
	{
		super(values);
	}
}
