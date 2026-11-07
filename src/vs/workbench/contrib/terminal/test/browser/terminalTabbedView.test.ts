/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Orientation, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalGroupService, ITerminalService } from '../../browser/terminal.js';
import { TerminalTabbedView } from '../../browser/terminalTabbedView.js';
import { TerminalTabList, TerminalTabsListSizes } from '../../browser/terminalTabsList.js';
import { TerminalTabsChatEntry } from '../../browser/terminalTabsChatEntry.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';

suite('TerminalTabbedView - restored panel orientation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('restores the narrow tab list when side-panel orientation arrives after initial layout', () => {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const orientation = store.add(new Emitter<Orientation>());
		instantiationService.stub(ITerminalService, {
			setContainers() { }, onDidChangeInstances: Event.None, onDidDisposeInstance: Event.None
		});
		instantiationService.stub(ITerminalChatService, {
			getToolSessionTerminalInstances: () => [], onDidRegisterTerminalInstanceWithToolSession: Event.None
		});
		instantiationService.stub(ITerminalConfigurationService, { config: { tabs: { enabled: true, hideCondition: 'never', location: 'right' } } });
		instantiationService.stub(ITerminalGroupService, {
			groups: [], instances: [], onDidChangeInstances: Event.None, onDidChangeGroups: Event.None,
			onDidChangePanelOrientation: orientation.event
		});
		const listElement = document.createElement('div');
		instantiationService.stubInstance(TerminalTabList, { getHTMLElement: () => listElement, layout() { }, refresh() { }, dispose() { } });
		instantiationService.stubInstance(TerminalTabsChatEntry, { element: document.createElement('div'), update() { }, dispose() { } });
		const parent = document.createElement('div');
		document.body.appendChild(parent);
		store.add(toDisposable(() => parent.remove()));
		const view = store.add(instantiationService.createInstance(TerminalTabbedView, parent));
		const splitView = store.add(Reflect.get(view, '_splitView') as SplitView);
		store.add(toDisposable(() => dispose(Reflect.get(view, '_sashDisposables'))));

		// The panel is laid out before restored terminal groups report their orientation.
		view.layout(292, 800);
		orientation.fire(Orientation.VERTICAL);
		strictEqual(splitView.getViewSize(1), TerminalTabsListSizes.NarrowViewWidth);
	});
});
