/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, ok } from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { TerminalGroup } from '../../browser/terminalGroup.js';
import { type ITerminalInstance } from '../../browser/terminal.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('Workbench - TerminalGroup', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('serializes pending split proportions before a hidden terminal group is laid out', () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const group = store.add(instantiationService.createInstance(TerminalGroup, undefined, undefined));
		const instances = Array.from({ length: 5 }, (_, index) => ({
			persistentProcessId: index + 1,
			shouldPersist: true
		} as ITerminalInstance));
		Reflect.set(group, '_terminalInstances', instances);

		// Reconnection supplies these ratios before the panel has a measurable size.
		// A second hidden reload saves the group before it is ever shown.
		group.resizePanes([0.2, 0.2, 0.2, 0.2, 0.2]);
		deepStrictEqual(group.getLayoutInfo(false).terminals.map(terminal => terminal.relativeSize),
			[0.2, 0.2, 0.2, 0.2, 0.2]);
	});
	test('normalizes pending ratios over persistent terminals without losing their indexes', () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const group = store.add(instantiationService.createInstance(TerminalGroup, undefined, undefined));
		const instances = Array.from({ length: 4 }, (_, index) => ({
			persistentProcessId: index + 1,
			shouldPersist: index !== 1
		} as ITerminalInstance));
		Reflect.set(group, '_terminalInstances', instances);
		group.resizePanes([0.1, 0.2, 0.3, 0.4]);

		const terminals = group.getLayoutInfo(false).terminals;
		deepStrictEqual(terminals.map(terminal => terminal.terminal), [1, 3, 4]);
		const expected = [0.125, 0.375, 0.5];
		terminals.forEach((terminal, index) => {
			ok(Number.isFinite(terminal.relativeSize) && Math.abs(terminal.relativeSize - expected[index]) <= 1e-10,
				`Persistent terminal ${index} lost its pending split ratio: ${terminal.relativeSize}`);
		});
	});

	test('uses measured pane sizes once layout has occurred', () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const group = store.add(instantiationService.createInstance(TerminalGroup, undefined, undefined));
		const instances = Array.from({ length: 2 }, (_, index) => ({
			persistentProcessId: index + 1,
			shouldPersist: true
		} as ITerminalInstance));
		Reflect.set(group, '_terminalInstances', instances);
		group.resizePanes([0.5, 0.5]);
		Reflect.set(group, '_initialRelativeSizes', undefined);
		Reflect.set(group, '_splitPaneContainer', {
			dispose() {},
			getPaneSize(instance: ITerminalInstance): number {
				return instance === instances[0] ? 100 : 200;
			}
		});
		deepStrictEqual(group.getLayoutInfo(false).terminals.map(terminal => terminal.relativeSize),
			[1 / 3, 2 / 3]);
	});
	test('uses measured pane sizes for all terminals when pending membership differs', () => {
		const instantiationService = workbenchInstantiationService({}, store);
		const group = store.add(instantiationService.createInstance(TerminalGroup, undefined, undefined));
		const instances = Array.from({ length: 3 }, (_, index) => ({
			persistentProcessId: index + 1,
			shouldPersist: true
		} as ITerminalInstance));
		Reflect.set(group, '_terminalInstances', instances);
		group.resizePanes([0.25, 0.75]);
		Reflect.set(group, '_splitPaneContainer', {
			dispose() {},
			getPaneSize(instance: ITerminalInstance): number {
				return (instances.indexOf(instance) + 1) * 100;
			}
		});
		deepStrictEqual(group.getLayoutInfo(false).terminals.map(terminal => terminal.relativeSize),
			[1 / 6, 1 / 3, 1 / 2]);
	});

});
