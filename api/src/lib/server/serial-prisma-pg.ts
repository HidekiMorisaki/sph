import { PrismaPg } from '@prisma/adapter-pg';

type Adapter = Awaited<ReturnType<PrismaPg['connect']>>;
type Transaction = Awaited<ReturnType<Adapter['startTransaction']>>;

/** One queue per transaction connection; pool queries and other transactions stay parallel. */
export function serialTransaction(transaction: Transaction): Transaction {
	let tail: Promise<void> = Promise.resolve();
	let finishing: { kind: 'commit' | 'rollback'; promise: Promise<void> } | undefined;

	function enqueue<T>(operation: () => Promise<T>): Promise<T> {
		if (finishing) return Promise.reject(new Error('Transaction has already been closed.'));
		const result = tail.then(operation);
		// Keep the queue usable for ROLLBACK after an SQL error, without hiding it
		// from the caller of the failed operation.
		tail = result.then(() => undefined, () => undefined);
		return result;
	}

	function finish(kind: 'commit' | 'rollback'): Promise<void> {
		// Never release a connection while its accepted queries are still running.
		if (finishing) return finishing.kind === kind ? finishing.promise : Promise.reject(new Error('Transaction has already been closed.'));
		const promise = tail.then(() => transaction[kind]());
		finishing = { kind, promise };
		return promise;
	}

	return {
		provider: transaction.provider,
		adapterName: transaction.adapterName,
		options: transaction.options,
		queryRaw: query => enqueue(() => transaction.queryRaw(query)),
		executeRaw: query => enqueue(() => transaction.executeRaw(query)),
		...(transaction.createSavepoint ? { createSavepoint: (name: string) => enqueue(() => transaction.createSavepoint!(name)) } : {}),
		...(transaction.rollbackToSavepoint ? { rollbackToSavepoint: (name: string) => enqueue(() => transaction.rollbackToSavepoint!(name)) } : {}),
		...(transaction.releaseSavepoint ? { releaseSavepoint: (name: string) => enqueue(() => transaction.releaseSavepoint!(name)) } : {}),
		commit: () => finish('commit'),
		rollback: () => finish('rollback')
	};
}

/** Use the adapter's public transaction interface, without patching pg internals. */
export class SerialPrismaPg extends PrismaPg {
	override async connect() {
		const adapter = await super.connect();
		const startTransaction = adapter.startTransaction.bind(adapter);
		adapter.startTransaction = async isolationLevel => serialTransaction(await startTransaction(isolationLevel));
		return adapter;
	}
}
