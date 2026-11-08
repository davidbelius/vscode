/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual } from 'assert';
import { Event } from '../../../../../base/common/event.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ITerminalLogService, type ITerminalsLayoutInfoById } from '../../../../../platform/terminal/common/terminal.js';
import { IConfigurationResolverService } from '../../../../services/configurationResolver/common/configurationResolver.js';
import { IHistoryService } from '../../../../services/history/common/history.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { IStatusbarService } from '../../../../services/statusbar/browser/statusbar.js';
import { TestContextService, TestStorageService } from '../../../../test/common/workbenchTestServices.js';
import { RemoteTerminalBackend } from '../../browser/remoteTerminalBackend.js';
import { RemoteTerminalChannelClient } from '../../common/remote/remoteTerminalChannel.js';
import { TerminalStorageKeys } from '../../common/terminalStorageKeys.js';

suite('RemoteTerminalBackend', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('republishes the saved panel split as historical IDs after client close and terminal revival', async () => {
		const storage = store.add(new TestStorageService());
		const calls: unknown[] = [];
		const channel = upcastPartial<RemoteTerminalChannelClient>({
			onPtyHostExit: Event.None, onPtyHostStart: Event.None,
			onPtyHostUnresponsive: Event.None, onPtyHostResponsive: Event.None,
			onPtyHostRequestResolveVariables: Event.None,
			onProcessData: Event.None, onProcessReplay: Event.None,
			onProcessOrphanQuestion: Event.None, onDidRequestDetach: Event.None,
			onProcessReady: Event.None, onDidChangeProperty: Event.None,
			onProcessExit: Event.None, onExecuteCommand: Event.None,
			setTerminalLayoutInfo: async (layout, isRevived) => { calls.push({ layout, isRevived: !!isRevived }); },
			reviveTerminalProcesses: async () => { calls.push('revive'); },
			getTerminalLayoutInfo: async () => { calls.push('get'); return undefined; }
		});
		const context = new TestContextService();
		const createBackend = () => store.add(new RemoteTerminalBackend(
			'test-remote', channel, upcastPartial<IRemoteAgentService>({}), upcastPartial<IInstantiationService>({}),
			upcastPartial<ITerminalLogService>(new NullLogService()), upcastPartial<ICommandService>({}), storage,
			upcastPartial<IRemoteAuthorityResolverService>({}), context, upcastPartial<IConfigurationResolverService>({}),
			upcastPartial<IHistoryService>({}), upcastPartial<IConfigurationService>({}), upcastPartial<IStatusbarService>({})
		));
		const layout: ITerminalsLayoutInfoById = {
			tabs: [{ isActive: true, activePersistentProcessId: 2, terminals: [{ terminal: 1, relativeSize: 0.4 }, { terminal: 2, relativeSize: 0.6 }] }],
			background: [3]
		};
		const first = createBackend();
		await first.setTerminalLayoutInfo(layout);
		first.dispose();
		// Closing saves buffers; the server survives but the processes must be revived.
		storage.store(TerminalStorageKeys.TerminalBufferState, JSON.stringify({ version: 1, state: [{ id: 1 }, { id: 2 }, { id: 3 }] }), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		await createBackend().getTerminalLayoutInfo();
		deepStrictEqual(calls, [
			{ layout, isRevived: false }, 'revive', { layout, isRevived: true }, 'get'
		]);
		deepStrictEqual(storage.get(TerminalStorageKeys.TerminalLayoutInfo, StorageScope.WORKSPACE), undefined);
	});
});
