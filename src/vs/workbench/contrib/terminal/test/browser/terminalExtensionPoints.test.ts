/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { ITerminalContributions } from '../../../../../platform/terminal/common/terminal.js';
import { ExtensionPoint, ExtensionsRegistry, IExtensionPointUser } from '../../../../services/extensions/common/extensionsRegistry.js';
import { TerminalContributionService } from '../../common/terminalExtensionPoints.js';

suite('TerminalContributionService', () => {
	test('terminal extension point notifies on profile addition and removal', () => {
		const point = ExtensionsRegistry.getExtensionPoints().find(p => p.name === 'terminal') as ExtensionPoint<ITerminalContributions> | undefined;
		if (!point) {
			throw new Error('terminal extension point is not registered');
		}
		point.acceptUsers([]);
		const service = new TerminalContributionService();
		let changes = 0;
		const listener = service.onDidChangeTerminalProfiles(() => changes++);
		const profile = { id: 'tmuxNativeProfile.persistent', title: 'Tmux Native Persistent' };
		const user = {
			description: { identifier: { value: 'vibecoded.tmux-native-profile' } },
			value: { profiles: [profile] },
			collector: { error() { }, warn() { }, info() { } }
		} as unknown as IExtensionPointUser<ITerminalContributions>;
		try {
			point.acceptUsers([user]);
			strictEqual(changes, 1);
			deepStrictEqual(service.terminalProfiles, [{ ...profile, extensionIdentifier: 'vibecoded.tmux-native-profile' }]);
			point.acceptUsers([]);
			strictEqual(changes, 2);
			deepStrictEqual(service.terminalProfiles, []);
		} finally {
			point.acceptUsers([]);
			listener.dispose();
		}
	});
});
