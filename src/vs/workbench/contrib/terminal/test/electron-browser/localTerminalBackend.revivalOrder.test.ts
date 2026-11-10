/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ILocalPtyService, ITerminalLogService, type ISerializedTerminalState } from '../../../../../platform/terminal/common/terminal.js';
import { IWorkspaceContextService } from '../../../../../platform/workspace/common/workspace.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IEnvironmentVariableService } from '../../common/environmentVariable.js';
import { EnvironmentVariableService } from '../../common/environmentVariableService.js';
import { ITerminalProfileResolverService } from '../../common/terminal.js';
import { TerminalStorageKeys } from '../../common/terminalStorageKeys.js';
import { TestContextService, TestHistoryService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { LocalPty } from '../../electron-browser/localPty.js';
import { LocalTerminalBackend } from '../../electron-browser/localTerminalBackend.js';

suite('LocalTerminalBackend editor revival order', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	async function fixture() {
		const services = store.add(new TestInstantiationService());
		const storage = store.add(new TestStorageService());
		const revivedIds = new Map<number, number>();
		const livePtys = new Map<number, number>();
		const attachRequests: [number, number | undefined][] = [];
		let revivalCalls = 0;
		let environmentRequests = 0;
		let failNextRevival = false;
		let gate: DeferredPromise<{ PATH: string }> | undefined;
		let entered: DeferredPromise<void> | undefined;

		services.stub(IWorkspaceContextService, new TestContextService());
		services.stub(IStorageService, storage);
		services.stub(ITerminalLogService, new NullLogService());
		services.stub(IConfigurationService, new TestConfigurationService());
		services.stub(IConfigurationResolverService, upcastPartial<IConfigurationResolverService>({
			resolveWithEnvironment: async (_environment, _folder, value) => value
		}));
		services.stub(IHistoryService, new TestHistoryService());
		services.stub(IProductService, upcastPartial<IProductService>({ version: 'test' }));
		services.stub(IExtensionService, upcastPartial<IExtensionService>({
			whenInstalledExtensionsRegistered: async () => true,
			onDidChangeExtensions: Event.None,
			extensions: []
		}));
		services.stub(ITerminalProfileResolverService, upcastPartial<ITerminalProfileResolverService>({
			getEnvironment: async () => {
				environmentRequests++;
				if (gate) {
					entered?.complete();
					return gate.p;
				}
				return { PATH: '/base/bin' };
			}
		}));
		const environmentVariables = store.add(services.createInstance(EnvironmentVariableService));
		services.stub(IEnvironmentVariableService, environmentVariables);
		services.stub(ILocalPtyService, upcastPartial<ILocalPtyService>({
			onPtyHostExit: Event.None,
			onPtyHostStart: Event.None,
			onPtyHostUnresponsive: Event.None,
			onPtyHostResponsive: Event.None,
			onPtyHostRequestResolveVariables: Event.None,
			getEnvironment: async () => ({ PATH: '/base/bin' }),
			reviveTerminalProcesses: async (_workspaceId: string, states: ISerializedTerminalState[]) => {
				revivalCalls++;
				if (failNextRevival) {
					failNextRevival = false;
					throw new Error('controlled revival failure');
				}
				for (const state of states) {
					const newId = state.id + 3;
					revivedIds.set(state.id, newId);
					livePtys.set(newId, newId * 1001);
				}
			},
			getRevivedPtyNewId: async (_workspaceId: string, id: number) => revivedIds.get(id),
			attachToProcess: async (id: number, pid?: number) => {
				attachRequests.push([id, pid]);
				const actual = livePtys.get(id);
				if (actual === undefined) {
					throw new Error(`Could not find pty ${id} on pty host`);
				}
				if (pid !== undefined && actual !== pid) {
					throw new Error(`Pty ${id} has pid ${actual}, expected ${pid}`);
				}
			},
			setTerminalLayoutInfo: async () => undefined,
			getTerminalLayoutInfo: async () => undefined
		}));
		const backend = store.add(services.createInstance(LocalTerminalBackend));
		const connected = new DeferredPromise<void>();
		await connected.complete();
		Reflect.set(backend, '_directProxyClientEventually', connected);

		return {
			backend,
			storage,
			livePtys,
			attachRequests,
			get revivalCalls() { return revivalCalls; },
			get environmentRequests() { return environmentRequests; },
			failOnce() { failNextRevival = true; },
			holdEnvironment() {
				gate = new DeferredPromise<{ PATH: string }>();
				entered = new DeferredPromise<void>();
				return { entered: entered.p, release: () => gate!.complete({ PATH: '/base/bin' }) };
			},
			save(id: number) {
				storage.store(TerminalStorageKeys.TerminalBufferState, JSON.stringify({
					version: 1,
					state: [{
						id,
						shellLaunchConfig: {},
						processLaunchConfig: {
							env: { PATH: '/old/bin' },
							executableEnv: {},
							options: {
								shellIntegration: { enabled: false, suggestEnabled: false, nonce: '' },
								windowsUseConptyDll: false,
								environmentVariableCollections: undefined,
								isScreenReaderOptimized: false
							}
						}
					}]
				}), StorageScope.WORKSPACE, StorageTarget.MACHINE);
			},
			track(pty: Awaited<ReturnType<LocalTerminalBackend['attachToRevivedProcess']>>) {
				if (pty instanceof LocalPty) {
					store.add(pty);
				}
				return pty?.id;
			}
		};
	}

	test('layout-first editor attach waits for one in-flight revival', async () => {
		const f = await fixture();
		f.save(2);
		const hold = f.holdEnvironment();
		const layout = f.backend.getTerminalLayoutInfo();
		await hold.entered;
		const concurrentLayout = f.backend.getTerminalLayoutInfo();
		const editor = f.backend.attachToRevivedProcess(2, 2222);
		// One event-loop checkpoint lets a premature lookup complete while the
		// explicit environment gate still holds revival. No timed sleep is used.
		await new Promise<void>(resolve => setImmediate(resolve));
		const earlyRequests = [...f.attachRequests];
		await hold.release();
		await Promise.all([layout, concurrentLayout]);
		const attachedId = f.track(await editor);
		deepStrictEqual(earlyRequests, []);
		deepStrictEqual(attachedId, 5);
		deepStrictEqual(f.revivalCalls, 1);
		// The ordinary post-revival lookup is the control for the same saved ID.
		deepStrictEqual(f.track(await f.backend.attachToRevivedProcess(2, 2222)), 5);
	});

	test('attach-first editor starts revival and layout joins it', async () => {
		const f = await fixture();
		f.save(7);
		const hold = f.holdEnvironment();
		const editor = f.backend.attachToRevivedProcess(7, 7777);
		await new Promise<void>(resolve => setImmediate(resolve));
		deepStrictEqual(f.environmentRequests, 1);
		await hold.entered;
		const layout = f.backend.getTerminalLayoutInfo();
		await new Promise<void>(resolve => setImmediate(resolve));
		deepStrictEqual(f.attachRequests, []);
		await hold.release();
		await layout;
		deepStrictEqual(f.track(await editor), 10);
		deepStrictEqual(f.revivalCalls, 1);
	});

	test('current saved ID and PID attach without stored state', async () => {
		const f = await fixture();
		f.livePtys.set(6, 606);
		deepStrictEqual(f.track(await f.backend.attachToRevivedProcess(6, 606)), 6);
		deepStrictEqual(f.attachRequests, [[6, 606]]);
		deepStrictEqual(f.revivalCalls, 0);
	});

	test('failed revival completes waiters and permits a later retry', async () => {
		const f = await fixture();
		f.save(9);
		f.failOnce();
		const first = f.holdEnvironment();
		const editor = f.backend.attachToRevivedProcess(9, 9999);
		await new Promise<void>(resolve => setImmediate(resolve));
		deepStrictEqual(f.environmentRequests, 1);
		await first.entered;
		const layout = f.backend.getTerminalLayoutInfo();
		await first.release();
		await layout;
		deepStrictEqual(f.track(await editor), undefined);
		deepStrictEqual(f.revivalCalls, 1);
		deepStrictEqual(!!f.storage.get(TerminalStorageKeys.TerminalBufferState, StorageScope.WORKSPACE), true);

		const second = f.holdEnvironment();
		const retry = f.backend.attachToRevivedProcess(9, 9999);
		await second.entered;
		await second.release();
		deepStrictEqual(f.track(await retry), 12);
		deepStrictEqual(f.revivalCalls, 2);
	});
});
