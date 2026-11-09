/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { RemoteTerminalBackend } from '../../browser/remoteTerminalBackend.js';

suite('RemoteTerminalBackend revival', () => {
	function backendWithProcesses(pids: Map<number, number>, revivedId: number | undefined) {
		const attempts: [id: number, pid: number | undefined][] = [];
		const lookups: number[] = [];
		const backend = Object.create(RemoteTerminalBackend.prototype) as RemoteTerminalBackend;
		Object.assign(backend, {
			_ptys: new Map(),
			_logService: { trace: () => { } },
			_instantiationService: { createInstance: (_type: unknown, id: number) => ({ id }) },
			_remoteTerminalChannel: {
				attachToProcess: async (id: number, pid?: number) => {
					attempts.push([id, pid]);
					if (!pids.has(id) || (pid !== undefined && pids.get(id) !== pid)) {
						throw new Error('Process ID or PID mismatch');
					}
				},
				getRevivedPtyNewId: async (id: number) => {
					lookups.push(id);
					return revivedId;
				}
			}
		});
		return { backend, attempts, lookups };
	}

	test('matching current process wins over stale revival mapping', async () => {
		const { backend, attempts, lookups } = backendWithProcesses(new Map([[21, 72265], [42, 99999]]), 42);
		deepStrictEqual(await backend.attachToRevivedProcess(21, 72265), { id: 21 });
		deepStrictEqual(attempts, [[21, 72265]]);
		deepStrictEqual(lookups, []);
	});

	test('PID mismatch uses revived process mapping', async () => {
		const { backend, attempts, lookups } = backendWithProcesses(new Map([[21, 99999], [42, 88888]]), 42);
		deepStrictEqual(await backend.attachToRevivedProcess(21, 72265), { id: 42 });
		deepStrictEqual(attempts, [[21, 72265], [42, undefined]]);
		deepStrictEqual(lookups, [21]);
	});

	test('missing current process attaches the revived process', async () => {
		const { backend, attempts, lookups } = backendWithProcesses(new Map([[42, 88888]]), 42);
		deepStrictEqual(await backend.attachToRevivedProcess(21, 72265), { id: 42 });
		deepStrictEqual(attempts, [[21, 72265], [42, undefined]]);
		deepStrictEqual(lookups, [21]);
	});

	test('unknown PID uses revival mapping before an unverified original ID', async () => {
		const { backend, attempts, lookups } = backendWithProcesses(new Map([[21, 99999], [42, 88888]]), 42);
		deepStrictEqual(await backend.attachToRevivedProcess(21, 0), { id: 42 });
		deepStrictEqual(attempts, [[42, undefined]]);
		deepStrictEqual(lookups, [21]);
	});

	test('unknown PID uses original ID when there is no mapping', async () => {
		const { backend, attempts, lookups } = backendWithProcesses(new Map([[21, 72265]]), undefined);
		deepStrictEqual(await backend.attachToRevivedProcess(21, 0), { id: 21 });
		deepStrictEqual(attempts, [[21, undefined]]);
		deepStrictEqual(lookups, [21]);
	});

	test('rejected mapped attach returns no process', async () => {
		const { backend, attempts, lookups } = backendWithProcesses(new Map(), 42);
		strictEqual(await backend.attachToRevivedProcess(21, 72265), undefined);
		deepStrictEqual(attempts, [[21, 72265], [42, undefined]]);
		deepStrictEqual(lookups, [21]);
	});

	test('PID mismatch without a mapping does not attach another process', async () => {
		const { backend, attempts } = backendWithProcesses(new Map([[21, 99999]]), undefined);
		strictEqual(await backend.attachToRevivedProcess(21, 72265), undefined);
		deepStrictEqual(attempts, [[21, 72265]]);
	});
});
