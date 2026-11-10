/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, isDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IShellLaunchConfig } from '../../../../../platform/terminal/common/terminal.js';
import { ITerminalEditingService, ITerminalGroup, ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../browser/terminal.js';
import { TerminalTabList, TerminalTabsAccessibilityProvider } from '../../browser/terminalTabsList.js';
import { TestTerminalGroupService, workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

function createInstance(instanceId: number, title: string, hostLabel?: string): ITerminalInstance {
	return new class extends mock<ITerminalInstance>() {
		override readonly instanceId = instanceId;
		override readonly title = title;
		override readonly shellLaunchConfig: IShellLaunchConfig = { hostLabel };
	};
}

suite('TerminalTabsAccessibilityProvider', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('labels name the remote host a terminal runs on', () => {
		const local = createInstance(1, 'zsh');
		const remote = createInstance(2, 'bash', 'devbox');
		const split = [createInstance(3, 'node', 'devbox'), createInstance(4, 'zsh')];
		const provider = new TerminalTabsAccessibilityProvider(new class extends mock<ITerminalGroupService>() {
			override getGroupForInstance(instance: ITerminalInstance): ITerminalGroup {
				const terminalInstances = split.includes(instance) ? split : [instance];
				return new class extends mock<ITerminalGroup>() {
					override readonly terminalInstances = terminalInstances;
				};
			}
		});

		assert.deepStrictEqual([local, remote, ...split].map(instance => provider.getAriaLabel(instance)), [
			'Terminal 1 zsh',
			'Terminal 2 bash on devbox',
			'Terminal 3 node on devbox, split 1 of 2',
			'Terminal 4 zsh, split 2 of 2',
		]);
	});
});

suite('TerminalTabList initial active selection', () => {
	let store: DisposableStore;
	setup(() => store = new DisposableStore());
	teardown(() => store.dispose());
	ensureNoDisposablesAreLeakedInTestSuite();

	function createList(activeInstanceIndex: 0 | 1 | 'missing' | 'none' = 1) {
		const container = document.createElement('div');
		document.body.appendChild(container);
		store.add(toDisposable(() => container.remove()));
		const instantiationService = workbenchInstantiationService(undefined, store);
		const instances = [1, 2].map(instanceId => ({
			instanceId,
			title: `terminal ${instanceId}`,
			resource: URI.from({ scheme: 'vscode-terminal', path: String(instanceId) }),
			icon: Codicon.terminal,
			shellLaunchConfig: {},
			statusList: { statuses: [], primary: undefined },
		}) as unknown as ITerminalInstance);
		const groupService = new class extends TestTerminalGroupService {
			override instances = instances;
			override activeInstance: ITerminalInstance | undefined = activeInstanceIndex === 'missing'
				? { ...instances[1], instanceId: 3 } as ITerminalInstance
				: activeInstanceIndex === 'none' ? undefined : instances[activeInstanceIndex];
			override getGroupForInstance(instance: ITerminalInstance): ITerminalGroup {
				return { terminalInstances: [instance] } as ITerminalGroup;
			}
		};
		instantiationService.stub(ITerminalGroupService, groupService);
		instantiationService.stub(ITerminalService, new class extends mock<ITerminalService>() {
			override onAnyInstanceTitleChange = Event.None;
			override onAnyInstanceIconChange = Event.None;
			override onAnyInstancePrimaryStatusChange = Event.None;
			override onDidChangeConnectionState = Event.None;
			override getPrimaryBackend(): undefined { return undefined; }
			override getInstanceFromResource(resource: URI): ITerminalInstance | undefined {
				return instances.find(instance => instance.resource.toString() === resource.toString());
			}
		});
		instantiationService.stub(ITerminalEditingService, new class extends mock<ITerminalEditingService>() {
			override isEditable(): boolean { return false; }
			override getEditingTerminal(): undefined { return undefined; }
			override getEditableData(): undefined { return undefined; }
		});
		// These existing constructor-created dependencies are not disposed with the list.
		const createInstance = instantiationService.createInstance;
		instantiationService.createInstance = ((ctor: unknown, ...args: unknown[]) => {
			const instance = Reflect.apply(createInstance, instantiationService, [ctor, ...args]);
			if (typeof ctor === 'function' && (ctor.name === 'ResourceLabels' || ctor.name === 'TerminalTabsDragAndDrop') && isDisposable(instance)) {
				store.add(instance);
			}
			return instance;
		}) as typeof instantiationService.createInstance;
		const list = store.add(instantiationService.createInstance(TerminalTabList, container));
		list.layout(300, 120);
		return { list, instances };
	}

	test('selects the already active second terminal when the list is created', () => {
		const { list, instances } = createList();
		assert.deepStrictEqual(list.getSelectedElements(), [instances[1]]);
		assert.deepStrictEqual(list.getSelection(), [1]);
	});

	test('selects the already active first terminal when the list is created', () => {
		const { list, instances } = createList(0);
		assert.deepStrictEqual(list.getSelectedElements(), [instances[0]]);
		assert.deepStrictEqual(list.getSelection(), [0]);
	});

	test('does not select a row when there is no active terminal', () => {
		const { list } = createList('none');
		assert.deepStrictEqual(list.getSelection(), []);
	});

	test('does not select a row for an active terminal absent from the list', () => {
		const { list } = createList('missing');
		assert.deepStrictEqual(list.getSelection(), []);
	});

	test('generic refresh preserves an intentional multi-selection', () => {
		const { list, instances } = createList();
		list.setSelection([0, 1]);
		list.refresh();
		assert.deepStrictEqual(list.getSelectedElements(), instances);
	});
});
