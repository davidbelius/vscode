/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, rejects } from 'assert';
import { SerializeAddon } from '@xterm/addon-serialize';
import pkg from '@xterm/headless';
import { createSandbox } from 'sinon';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { ISerializedTerminalState, TitleEventSource } from '../../common/terminal.js';
import { PtyService, XtermSerializer } from '../../node/ptyService.js';

suite('XtermSerializer', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const sandbox = createSandbox();

	teardown(() => sandbox.restore());

	function createSerializer(rawReviveBuffer?: string) {
		const loadAddon = sandbox.spy(pkg.Terminal.prototype, 'loadAddon');
		const serializer = new XtermSerializer(80, 30, 100, '6', undefined, 'test-nonce', rawReviveBuffer, new NullLogService());
		const terminal: pkg.Terminal = loadAddon.firstCall.thisValue;
		store.add(toDisposable(() => terminal.dispose()));
		return { serializer, terminal };
	}

	test('releases each replay addon without changing the serialized screen', async () => {
		const { serializer, terminal } = createSerializer();
		const dispose = sandbox.spy(SerializeAddon.prototype, 'dispose');
		await new Promise<void>(resolve => terminal.write('replay-ready', resolve));
		const results = [];
		for (let index = 0; index < 3; index++) {
			const replay = await serializer.generateReplayEvent();
			results.push({ disposed: dispose.callCount, screen: replay.events[0].data });
		}
		deepStrictEqual(results, [
			{ disposed: 1, screen: 'replay-ready' },
			{ disposed: 2, screen: 'replay-ready' },
			{ disposed: 3, screen: 'replay-ready' }
		]);
	});

	test('releases each addon when serialization throws on repeated attempts', async () => {
		const { serializer } = createSerializer();
		const dispose = sandbox.spy(SerializeAddon.prototype, 'dispose');
		const failure = new Error('Serialization failed');
		sandbox.stub(SerializeAddon.prototype, 'serialize').throws(failure);
		const disposalCounts = [];
		for (let index = 0; index < 3; index++) {
			await rejects(serializer.generateReplayEvent(), error => error === failure);
			disposalCounts.push(dispose.callCount);
		}
		deepStrictEqual(disposalCounts, [1, 2, 3]);
	});

	test('releases the addon when reusing a saved screen', async () => {
		const { serializer } = createSerializer('saved screen');
		const dispose = sandbox.spy(SerializeAddon.prototype, 'dispose');
		const serialize = sandbox.spy(SerializeAddon.prototype, 'serialize');
		const replay = await serializer.generateReplayEvent(true, true);
		deepStrictEqual({ disposed: dispose.callCount, serialized: serialize.callCount, screen: replay.events[0].data }, { disposed: 1, serialized: 0, screen: 'saved screen' });
	});
});

suite('PtyService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('current panel layout does not consume a retained editor revival mapping with a colliding id', async () => {
		const service = store.add(new PtyService(new NullLogService(), upcastPartial<IProductService>({}), { graceTime: 60000, shortGraceTime: 6000, scrollback: 100 }, 0));
		const sandbox = createSandbox();
		store.add(toDisposable(() => sandbox.restore()));
		sandbox.stub(service, 'createProcess').resolves(1);
		await service.reviveTerminalProcesses('workspace', [upcastPartial<ISerializedTerminalState>({
			id: 40,
			shellLaunchConfig: {},
			processDetails: upcastPartial<ISerializedTerminalState['processDetails']>({ cwd: '/test', workspaceId: 'workspace', workspaceName: 'test', title: 'revived editor', titleSource: TitleEventSource.Api }),
			processLaunchConfig: { env: {}, executableEnv: {}, options: upcastPartial<ISerializedTerminalState['processLaunchConfig']['options']>({}) },
			unicodeVersion: '6',
			replayEvent: upcastPartial<ISerializedTerminalState['replayEvent']>({ events: [{ cols: 80, rows: 24, data: '' }] })
		})], 'en');
		// Editor restoration looks up its new id independently of panel layout restoration.
		deepStrictEqual(await service.getRevivedPtyNewId('workspace', 40), 1);
		const ptys: Map<number, object> = Reflect.get(service, '_ptys');
		// Both the old editor's revived target and the current panel ID are live.
		for (const id of [1, 40, 41]) {
			ptys.set(id, {
				pid: 1000 + id, title: `panel-${id}`, titleSource: TitleEventSource.Api,
				workspaceId: 'workspace', workspaceName: 'test',
				getCwd: async () => '/test', isOrphaned: async () => true,
				processLaunchOptions: { options: { shellIntegration: { nonce: 'test-nonce' } } },
				shellLaunchConfig: {}, shutdown: () => { }
			});
		}
		await service.setTerminalLayoutInfo({ workspaceId: 'workspace', tabs: [{ isActive: true, activePersistentProcessId: 41, terminals: [{ terminal: 40, relativeSize: 0.4 }, { terminal: 41, relativeSize: 0.6 }] }], background: null });
		const results = [];
		for (let i = 0; i < 2; i++) {
			const layout = await service.getTerminalLayoutInfo({ workspaceId: 'workspace' });
			results.push(layout?.tabs.map(tab => ({ active: tab.activePersistentProcessId, terminals: tab.terminals.map(t => ({ id: t.terminal?.id, title: t.terminal?.title, size: t.relativeSize })) })));
		}
		const expected = [{ active: 41, terminals: [{ id: 40, title: 'panel-40', size: 0.4 }, { id: 41, title: 'panel-41', size: 0.6 }] }];
		deepStrictEqual({ results, editorRevivalId: await service.getRevivedPtyNewId('workspace', 40) }, { results: [expected, expected], editorRevivalId: 1 });
	});

	test('saved layout resolves only its workspace revival IDs, including active split and background', async () => {
		const service = store.add(new PtyService(new NullLogService(), upcastPartial<IProductService>({}), { graceTime: 60000, shortGraceTime: 6000, scrollback: 100 }, 0));
		const ptys: Map<number, object> = Reflect.get(service, '_ptys');
		for (const id of [2, 3, 4, 5, 7, 10]) {
			ptys.set(id, {
				pid: 1000 + id, title: `pty-${id}`, titleSource: TitleEventSource.Api,
				workspaceId: 'workspace', workspaceName: 'test',
				getCwd: async () => '/test', isOrphaned: async () => false,
				processLaunchOptions: { options: { shellIntegration: { nonce: 'test-nonce' } } },
				shellLaunchConfig: {}, shutdown: () => { }
			});
		}
		const revived: Map<string, { newId: number; state: ISerializedTerminalState }> = Reflect.get(service, '_revivedPtyIdMap');
		for (const [oldId, newId] of [[7, 2], [8, 3], [9, 4]]) {
			revived.set(`workspace-${oldId}`, { newId, state: upcastPartial<ISerializedTerminalState>({}) });
		}
		revived.set('other-7', { newId: 5, state: upcastPartial<ISerializedTerminalState>({}) });
		const savedLayout = {
			workspaceId: 'workspace', isRevived: true,
			tabs: [{ isActive: true, activePersistentProcessId: 8, terminals: [{ terminal: 7, relativeSize: 0.4 }, { terminal: 8, relativeSize: 0.6 }, { terminal: 10, relativeSize: 0.1 }] }],
			background: [9]
		};
		await service.setTerminalLayoutInfo(savedLayout);
		deepStrictEqual(savedLayout.tabs[0].terminals.map(t => t.terminal), [7, 8, 10]);
		deepStrictEqual(savedLayout.background, [9]);
		for (let i = 0; i < 2; i++) {
			const layout = await service.getTerminalLayoutInfo({ workspaceId: 'workspace' });
			deepStrictEqual(layout?.tabs.map(tab => ({ active: tab.activePersistentProcessId, terminals: tab.terminals.map(t => [t.terminal?.id, t.terminal?.isOrphan, t.relativeSize]) })), [
				{ active: 3, terminals: [[2, i === 0, 0.4], [3, i === 0, 0.6]] }
			]);
			deepStrictEqual(layout?.background?.map(terminal => [terminal?.id, terminal?.isOrphan]), [[4, i === 0]]);
		}
		await service.setTerminalLayoutInfo({ workspaceId: 'workspace', tabs: [{ isActive: true, activePersistentProcessId: 7, terminals: [{ terminal: 7, relativeSize: 1 }] }], background: null });
		const currentLayout = await service.getTerminalLayoutInfo({ workspaceId: 'workspace' });
		deepStrictEqual(currentLayout?.tabs[0].terminals.map(t => [t.terminal?.id, t.terminal?.isOrphan]), [[7, false]]);
		// Panel revival mappings are consumed, so a future editor using ID 7 will
		// not attach to PTY 2. The unrelated workspace mapping remains intact.
		deepStrictEqual([await service.getRevivedPtyNewId('workspace', 7), await service.getRevivedPtyNewId('other', 7)], [undefined, 5]);
	});

	test('attachToProcess only attaches when the expected pid matches', async () => {
		const service = store.add(new PtyService(new NullLogService(), upcastPartial<IProductService>({}), { graceTime: 60000, shortGraceTime: 6000, scrollback: 100 }, 0));
		let attachCount = 0;
		// Stand in for a running persistent process to avoid spawning a pty
		const ptys: Map<number, { pid: number; attach(): Promise<void>; shutdown(): void }> = Reflect.get(service, '_ptys');
		ptys.set(1, { pid: 1234, attach: async () => { attachCount++; }, shutdown: () => { } });

		async function attach(pid?: number): Promise<string> {
			try {
				await service.attachToProcess(1, pid);
				return 'attached';
			} catch {
				return 'rejected';
			}
		}
		const results = { otherPid: await attach(4321), samePid: await attach(1234), noPid: await attach() };

		deepStrictEqual({ ...results, attachCount }, { otherPid: 'rejected', samePid: 'attached', noPid: 'attached', attachCount: 2 });
	});
});
