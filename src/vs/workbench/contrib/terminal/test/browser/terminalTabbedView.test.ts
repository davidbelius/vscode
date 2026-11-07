/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { strictEqual } from 'assert';
import { Orientation, SplitView } from '../../../../../base/browser/ui/splitview/splitview.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { dispose, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { ViewContainerLocation, IViewDescriptorService } from '../../../../common/views.js';
import { IWorkbenchLayoutService, Position } from '../../../../services/layout/browser/layoutService.js';
import { ITerminalChatService, ITerminalConfigurationService, ITerminalGroupService, ITerminalService } from '../../browser/terminal.js';
import { TerminalTabbedView } from '../../browser/terminalTabbedView.js';
import { TerminalTabList, TerminalTabsListSizes } from '../../browser/terminalTabsList.js';
import { TerminalTabsChatEntry } from '../../browser/terminalTabsChatEntry.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TerminalStorageKeys } from '../../common/terminalStorageKeys.js';

suite('TerminalTabbedView - restored panel orientation', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createView(position: Position, location = ViewContainerLocation.Panel, orientationDuringGroupLayout?: Orientation, hideCondition: 'never' | 'singleTerminal' = 'never') {
		const instantiationService = workbenchInstantiationService(undefined, store);
		const orientation = store.add(new Emitter<Orientation>());
		let currentPosition = position;
		let currentLocation = location;
		instantiationService.stub(IWorkbenchLayoutService, { getPanelPosition: () => currentPosition });
		instantiationService.stub(IViewDescriptorService, { getViewLocationById: () => currentLocation });
		instantiationService.stub(ITerminalService, {
			setContainers() { }, onDidChangeInstances: Event.None, onDidDisposeInstance: Event.None
		});
		instantiationService.stub(ITerminalChatService, {
			getToolSessionTerminalInstances: () => [], onDidRegisterTerminalInstanceWithToolSession: Event.None
		});
		instantiationService.stub(ITerminalConfigurationService, { config: { tabs: { enabled: true, hideCondition, location: 'right' } } as ITerminalConfigurationService['config'] });
		instantiationService.stub(ITerminalGroupService, {
			groups: (orientationDuringGroupLayout === undefined ? [] : [{ layout: () => orientation.fire(orientationDuringGroupLayout) }]) as unknown as ITerminalGroupService['groups'], instances: [], onDidChangeInstances: Event.None, onDidChangeGroups: Event.None,
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
		return { view, splitView, orientation, storage: instantiationService.get(IStorageService), setLocation: (newPosition: Position, newLocation = ViewContainerLocation.Panel) => { currentPosition = newPosition; currentLocation = newLocation; } };
	}

	test('uses side-panel width at startup when no group orientation event arrives', () => {
		const { view, splitView } = createView(Position.RIGHT);
		view.layout(292, 800);
		strictEqual(splitView.getViewSize(1), TerminalTabsListSizes.NarrowViewWidth);
	});

	test('handles an orientation event during split view layout', async () => {
		const { view, splitView } = createView(Position.BOTTOM, ViewContainerLocation.Panel, Orientation.VERTICAL);
		view.layout(292, 800);
		await Promise.resolve();
		strictEqual(splitView.getViewSize(1), TerminalTabsListSizes.NarrowViewWidth);
	});

	test('restores the narrow tab list when side-panel orientation arrives after initial layout', async () => {
		const { view, splitView, orientation, setLocation } = createView(Position.BOTTOM);
		// The panel is laid out before restored terminal groups report their orientation.
		view.layout(292, 800);
		setLocation(Position.RIGHT);
		orientation.fire(Orientation.VERTICAL);
		await Promise.resolve();
		strictEqual(splitView.getViewSize(1), TerminalTabsListSizes.NarrowViewWidth);
	});

	test('keeps saved widths separate across orientation switches and repeated events', async () => {
		const { view, splitView, orientation, storage, setLocation } = createView(Position.BOTTOM);
		storage.store(TerminalStorageKeys.TabsListWidthHorizontal, 180, StorageScope.PROFILE, StorageTarget.USER);
		storage.store(TerminalStorageKeys.TabsListWidthVertical, 140, StorageScope.PROFILE, StorageTarget.USER);
		view.layout(400, 800);
		strictEqual(splitView.getViewSize(1), 180);
		setLocation(Position.RIGHT);
		orientation.fire(Orientation.VERTICAL);
		orientation.fire(Orientation.VERTICAL);
		await Promise.resolve();
		strictEqual(splitView.getViewSize(1), 140);
		strictEqual(storage.get(TerminalStorageKeys.TabsListWidthHorizontal, StorageScope.PROFILE), '180');
		setLocation(Position.TOP);
		view.layout(400, 800);
		strictEqual(splitView.getViewSize(1), 180);
		strictEqual(storage.get(TerminalStorageKeys.TabsListWidthVertical, StorageScope.PROFILE), '140');
	});

	test('coalesces rapid orientation changes to the latest width', async () => {
		const { view, splitView, orientation, storage } = createView(Position.BOTTOM);
		storage.store(TerminalStorageKeys.TabsListWidthHorizontal, 180, StorageScope.PROFILE, StorageTarget.USER);
		storage.store(TerminalStorageKeys.TabsListWidthVertical, 140, StorageScope.PROFILE, StorageTarget.USER);
		view.layout(400, 800);
		orientation.fire(Orientation.VERTICAL);
		orientation.fire(Orientation.HORIZONTAL);
		await Promise.resolve();
		strictEqual(splitView.getViewSize(1), 180);
	});

	test('treats sidebar and auxiliary bar as vertical on startup', () => {
		for (const location of [ViewContainerLocation.Sidebar, ViewContainerLocation.AuxiliaryBar]) {
			const { view, splitView } = createView(Position.BOTTOM, location);
			view.layout(292, 800);
			strictEqual(splitView.getViewSize(1), TerminalTabsListSizes.NarrowViewWidth);
		}
	});

	test('skips queued resize when tabs are hidden or the view is disposed', async () => {
		const hidden = createView(Position.BOTTOM, ViewContainerLocation.Panel, undefined, 'singleTerminal');
		hidden.view.layout(292, 800);
		hidden.orientation.fire(Orientation.VERTICAL);
		const disposed = createView(Position.BOTTOM);
		disposed.view.layout(292, 800);
		const widthBeforeDispose = disposed.splitView.getViewSize(1);
		disposed.orientation.fire(Orientation.VERTICAL);
		disposed.view.dispose();
		await Promise.resolve();
		strictEqual(hidden.splitView.length, 1);
		strictEqual(disposed.splitView.getViewSize(1), widthBeforeDispose);
	});
});
