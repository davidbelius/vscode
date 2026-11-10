/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { deepStrictEqual, strictEqual } from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { Codicon } from '../../../../../base/common/codicons.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { isLinux, isWindows, OperatingSystem } from '../../../../../base/common/platform.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ConfigurationTarget, IConfigurationService, type IConfigurationChangeEvent } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IPickOptions, IQuickInputService, IQuickPick, IQuickPickItem, Omit, QuickPickInput } from '../../../../../platform/quickinput/common/quickInput.js';
import { IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import { IExtensionTerminalProfile, ITerminalBackend, ITerminalProfile } from '../../../../../platform/terminal/common/terminal.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { ITerminalInstanceService } from '../../browser/terminal.js';
import { IProfileQuickPickItem, TerminalProfileQuickpick } from '../../browser/terminalProfileQuickpick.js';
import { TerminalProfileService } from '../../browser/terminalProfileService.js';
import { ITerminalConfiguration, ITerminalProfileService } from '../../common/terminal.js';
import { ITerminalContributionService } from '../../common/terminalExtensionPoints.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IRemoteAgentService } from '../../../../services/remote/common/remoteAgentService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { TestExtensionService } from '../../../../test/common/workbenchTestServices.js';
import type { SingleOrMany } from '../../../../../base/common/types.js';

class TestTerminalProfileService extends TerminalProfileService implements Partial<ITerminalProfileService> {
	hasRefreshedProfiles: Promise<void> | undefined;
	override refreshAvailableProfiles(): void {
		this.hasRefreshedProfiles = this._refreshAvailableProfilesNow();
	}
	refreshAndAwaitAvailableProfiles(): Promise<void> {
		this.refreshAvailableProfiles();
		if (!this.hasRefreshedProfiles) {
			throw new Error('has not refreshed profiles yet');
		}
		return this.hasRefreshedProfiles;
	}
}

class MockTerminalProfileService implements Partial<ITerminalProfileService> {
	hasRefreshedProfiles: Promise<void> | undefined;
	_defaultProfileName: string | undefined;
	availableProfiles?: ITerminalProfile[] | undefined = [];
	contributedProfiles?: IExtensionTerminalProfile[] | undefined = [];
	private readonly _onDidChangeAvailableProfiles = new Emitter<ITerminalProfile[]>();
	readonly onDidChangeAvailableProfiles = this._onDidChangeAvailableProfiles.event;
	async getPlatformKey(): Promise<string> {
		return 'linux';
	}
	getDefaultProfileName(): string | undefined {
		return this._defaultProfileName;
	}
	setProfiles(profiles: ITerminalProfile[], contributed: IExtensionTerminalProfile[]): void {
		this.availableProfiles = profiles;
		this.contributedProfiles = contributed;
		this._onDidChangeAvailableProfiles.fire(profiles);
	}
	setDefaultProfileName(name: string): void {
		this._defaultProfileName = name;
	}
}


class MockQuickInputService implements Partial<IQuickInputService> {
	_pick: IProfileQuickPickItem = powershellPick;
	pick(picks: QuickPickInput<IProfileQuickPickItem>[] | Promise<QuickPickInput<IProfileQuickPickItem>[]>, options?: IPickOptions<IProfileQuickPickItem> & { canPickMany: true }, token?: CancellationToken): Promise<IProfileQuickPickItem[] | undefined>;
	pick(picks: QuickPickInput<IProfileQuickPickItem>[] | Promise<QuickPickInput<IProfileQuickPickItem>[]>, options?: IPickOptions<IProfileQuickPickItem> & { canPickMany: false }, token?: CancellationToken): Promise<IProfileQuickPickItem | undefined>;
	pick(picks: QuickPickInput<IProfileQuickPickItem>[] | Promise<QuickPickInput<IProfileQuickPickItem>[]>, options?: Omit<IPickOptions<IProfileQuickPickItem>, 'canPickMany'>, token?: CancellationToken): Promise<IProfileQuickPickItem | undefined>;
	async pick(picks: any, options?: any, token?: any): Promise<SingleOrMany<IProfileQuickPickItem> | undefined> {
		Promise.resolve(picks);
		return this._pick;
	}

	setPick(pick: IProfileQuickPickItem) {
		this._pick = pick;
	}
}

class LiveQuickInputService extends MockQuickInputService {
	private _items: QuickPickInput<IProfileQuickPickItem>[] = [];
	private _selectionResolve: ((item: IProfileQuickPickItem | undefined) => void) | undefined;
	private readonly _onDidAccept = new Emitter<{ inBackground: boolean }>();
	private readonly _onDidHide = new Emitter<void>();
	private _selectedItems: IProfileQuickPickItem[] = [];
	private _activeItems: IProfileQuickPickItem[] = [];
	private _shownResolve!: () => void;
	readonly shown = new Promise<void>(resolve => this._shownResolve = resolve);
	get visibleProfileNames(): string[] {
		return this._items.filter((item): item is IProfileQuickPickItem => 'profileName' in item).map(item => item.profileName);
	}
	select(profileName: string): void {
		const item = this._items.find((candidate): candidate is IProfileQuickPickItem => 'profileName' in candidate && candidate.profileName === profileName);
		if (!item) {
			throw new Error(`profile ${profileName} is not selectable in the open picker`);
		}
		if (this._selectionResolve) {
			this._selectionResolve(item);
			this._selectionResolve = undefined;
		} else {
			this._selectedItems = [item];
			this._onDidAccept.fire({ inBackground: false });
		}
	}
	dismiss(): void {
		this._selectionResolve?.(undefined);
		this._selectionResolve = undefined;
		this._onDidHide.fire();
	}
	dispose(): void {
		this._onDidAccept.dispose();
		this._onDidHide.dispose();
	}
	override pick(picks: QuickPickInput<IProfileQuickPickItem>[] | Promise<QuickPickInput<IProfileQuickPickItem>[]>, options?: IPickOptions<IProfileQuickPickItem> & { canPickMany: true }, token?: CancellationToken): Promise<IProfileQuickPickItem[] | undefined>;
	override pick(picks: QuickPickInput<IProfileQuickPickItem>[] | Promise<QuickPickInput<IProfileQuickPickItem>[]>, options?: IPickOptions<IProfileQuickPickItem> & { canPickMany: false }, token?: CancellationToken): Promise<IProfileQuickPickItem | undefined>;
	override pick(picks: QuickPickInput<IProfileQuickPickItem>[] | Promise<QuickPickInput<IProfileQuickPickItem>[]>, options?: Omit<IPickOptions<IProfileQuickPickItem>, 'canPickMany'>, token?: CancellationToken): Promise<IProfileQuickPickItem | undefined>;
	override async pick(picks: QuickPickInput<IProfileQuickPickItem>[] | Promise<QuickPickInput<IProfileQuickPickItem>[]>): Promise<SingleOrMany<IProfileQuickPickItem> | undefined> {
		this._items = await picks;
		this._shownResolve();
		return new Promise(resolve => this._selectionResolve = resolve);
	}
	createQuickPick<T extends IQuickPickItem>(options: { useSeparators: true }): IQuickPick<T, { useSeparators: true }>;
	createQuickPick<T extends IQuickPickItem>(options?: { useSeparators: boolean }): IQuickPick<T, { useSeparators: false }>;
	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T, { useSeparators: boolean }> {
		const service = this;
		return {
			get items() { return service._items as unknown as readonly QuickPickInput<T>[]; },
			set items(value: readonly QuickPickInput<T>[]) { service._items = value as unknown as QuickPickInput<IProfileQuickPickItem>[]; },
			get selectedItems() { return service._selectedItems as unknown as readonly T[]; },
			set selectedItems(value: readonly T[]) { service._selectedItems = value as unknown as IProfileQuickPickItem[]; },
			get activeItems() { return service._activeItems as unknown as readonly T[]; },
			set activeItems(value: readonly T[]) { service._activeItems = value as unknown as IProfileQuickPickItem[]; },
			onDidAccept: service._onDidAccept.event,
			onDidHide: service._onDidHide.event,
			onDidTriggerItemButton: Event.None,
			show: () => service._shownResolve(),
			hide: () => service._onDidHide.fire(),
			dispose: () => { }
		} as unknown as IQuickPick<T, { useSeparators: boolean }>;
	}
}

class TestTerminalProfileQuickpick extends TerminalProfileQuickpick {

}

class TestTerminalExtensionService extends TestExtensionService {
	readonly _onDidChangeExtensions = new Emitter<void>();
}

class TestTerminalContributionService implements ITerminalContributionService {
	_serviceBrand: undefined;
	terminalProfiles: readonly IExtensionTerminalProfile[] = [];
	terminalCompletionProviders: readonly import('../../common/terminalExtensionPoints.js').IExtensionTerminalCompletionProvider[] = [];
	private _onDidChangeTerminalCompletionProviders = new Emitter<void>();
	readonly onDidChangeTerminalCompletionProviders = this._onDidChangeTerminalCompletionProviders.event;
	setProfiles(profiles: IExtensionTerminalProfile[]): void {
		this.terminalProfiles = profiles;
	}
}

class TestTerminalInstanceService implements Partial<ITerminalInstanceService> {
	private _profiles: Map<string, ITerminalProfile[]> = new Map();
	private _hasReturnedNone = true;
	async getBackend(remoteAuthority: string | undefined): Promise<ITerminalBackend> {
		return {
			getProfiles: async () => {
				if (this._hasReturnedNone) {
					return this._profiles.get(remoteAuthority ?? '') || [];
				} else {
					this._hasReturnedNone = true;
					return [];
				}
			}
		} satisfies Partial<ITerminalBackend> as unknown as ITerminalBackend;
	}
	setProfiles(remoteAuthority: string | undefined, profiles: ITerminalProfile[]) {
		this._profiles.set(remoteAuthority ?? '', profiles);
	}
	setReturnNone() {
		this._hasReturnedNone = false;
	}
}

class TestRemoteAgentService implements Partial<IRemoteAgentService> {
	private _os: OperatingSystem | undefined;
	setEnvironment(os: OperatingSystem) {
		this._os = os;
	}
	async getEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		return { os: this._os } satisfies Partial<IRemoteAgentEnvironment> as unknown as IRemoteAgentEnvironment;
	}
}

const defaultTerminalConfig: Partial<ITerminalConfiguration> = { profiles: { windows: {}, linux: {}, osx: {} } };
let powershellProfile = {
	profileName: 'PowerShell',
	path: 'C:\\Powershell.exe',
	isDefault: true,
	icon: Codicon.terminalPowershell
};
let jsdebugProfile = {
	extensionIdentifier: 'ms-vscode.js-debug-nightly',
	icon: 'debug',
	id: 'extension.js-debug.debugTerminal',
	title: 'JavaScript Debug Terminal'
};
const powershellPick = { label: 'Powershell', profile: powershellProfile, profileName: powershellProfile.profileName };
const jsdebugPick = { label: 'Javascript Debug Terminal', profile: jsdebugProfile, profileName: jsdebugProfile.title };

suite('TerminalProfileService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	let configurationService: TestConfigurationService;
	let terminalInstanceService: TestTerminalInstanceService;
	let terminalProfileService: TestTerminalProfileService;
	let remoteAgentService: TestRemoteAgentService;
	let extensionService: TestTerminalExtensionService;
	let instantiationService: TestInstantiationService;

	setup(async () => {
		configurationService = new TestConfigurationService({
			files: {},
			terminal: {
				integrated: defaultTerminalConfig
			}
		});
		instantiationService = workbenchInstantiationService({
			configurationService: () => configurationService
		}, store);
		remoteAgentService = new TestRemoteAgentService();
		terminalInstanceService = new TestTerminalInstanceService();
		extensionService = new TestTerminalExtensionService();

		const themeService = new TestThemeService();
		const terminalContributionService = new TestTerminalContributionService();

		instantiationService.stub(IExtensionService, extensionService);
		instantiationService.stub(IConfigurationService, configurationService);
		instantiationService.stub(IRemoteAgentService, remoteAgentService);
		instantiationService.stub(ITerminalContributionService, terminalContributionService);
		instantiationService.stub(ITerminalInstanceService, terminalInstanceService);
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: undefined });
		instantiationService.stub(IThemeService, themeService);

		terminalProfileService = store.add(instantiationService.createInstance(TestTerminalProfileService));

		//reset as these properties are changed in each test
		powershellProfile = {
			profileName: 'PowerShell',
			path: 'C:\\Powershell.exe',
			isDefault: true,
			icon: Codicon.terminalPowershell
		};
		jsdebugProfile = {
			extensionIdentifier: 'ms-vscode.js-debug-nightly',
			icon: 'debug',
			id: 'extension.js-debug.debugTerminal',
			title: 'JavaScript Debug Terminal'
		};

		terminalInstanceService.setProfiles(undefined, [powershellProfile]);
		terminalInstanceService.setProfiles('fakeremote', []);
		terminalContributionService.setProfiles([jsdebugProfile]);
		if (isWindows) {
			remoteAgentService.setEnvironment(OperatingSystem.Windows);
		} else if (isLinux) {
			remoteAgentService.setEnvironment(OperatingSystem.Linux);
		} else {
			remoteAgentService.setEnvironment(OperatingSystem.Macintosh);
		}
		configurationService.setUserConfiguration('terminal', { integrated: defaultTerminalConfig });
	});

	suite('Contributed Profiles', () => {
		test('should filter out contributed profiles set to null (Linux)', async () => {
			remoteAgentService.setEnvironment(OperatingSystem.Linux);
			await configurationService.setUserConfiguration('terminal', {
				integrated: {
					profiles: {
						linux: {
							'JavaScript Debug Terminal': null
						}
					}
				}
			});
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: ConfigurationTarget.USER } satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
			await terminalProfileService.refreshAndAwaitAvailableProfiles();
			deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
			deepStrictEqual(terminalProfileService.contributedProfiles, []);
		});
		test('should filter out contributed profiles set to null (Windows)', async () => {
			remoteAgentService.setEnvironment(OperatingSystem.Windows);
			await configurationService.setUserConfiguration('terminal', {
				integrated: {
					profiles: {
						windows: {
							'JavaScript Debug Terminal': null
						}
					}
				}
			});
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: ConfigurationTarget.USER } satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
			await terminalProfileService.refreshAndAwaitAvailableProfiles();
			deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
			deepStrictEqual(terminalProfileService.contributedProfiles, []);
		});
		test('should filter out contributed profiles set to null (macOS)', async () => {
			remoteAgentService.setEnvironment(OperatingSystem.Macintosh);
			await configurationService.setUserConfiguration('terminal', {
				integrated: {
					profiles: {
						osx: {
							'JavaScript Debug Terminal': null
						}
					}
				}
			});
			configurationService.onDidChangeConfigurationEmitter.fire({ affectsConfiguration: () => true, source: ConfigurationTarget.USER } satisfies Partial<IConfigurationChangeEvent> as unknown as IConfigurationChangeEvent);
			await terminalProfileService.refreshAndAwaitAvailableProfiles();
			deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
			deepStrictEqual(terminalProfileService.contributedProfiles, []);
		});
		test('should include contributed profiles', async () => {
			await terminalProfileService.refreshAndAwaitAvailableProfiles();
			deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
			deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
		});
	});

	test('should get profiles from remoteTerminalService when there is a remote authority', async () => {
		instantiationService.stub(IWorkbenchEnvironmentService, { remoteAuthority: 'fakeremote' });
		terminalProfileService = store.add(instantiationService.createInstance(TestTerminalProfileService));
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(terminalProfileService.availableProfiles, []);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
		terminalInstanceService.setProfiles('fakeremote', [powershellProfile]);
		await terminalProfileService.refreshAndAwaitAvailableProfiles();
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
	});

	test('should fire onDidChangeAvailableProfiles only when available profiles have changed via user config', async () => {
		powershellProfile.icon = Codicon.lightBulb;
		let calls: ITerminalProfile[][] = [];
		store.add(terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e)));
		await configurationService.setUserConfiguration('terminal', {
			integrated: {
				profiles: {
					windows: powershellProfile,
					linux: powershellProfile,
					osx: powershellProfile
				}
			}
		});
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(calls, [
			[powershellProfile]
		]);
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
		calls = [];
		await terminalProfileService.refreshAndAwaitAvailableProfiles();
		deepStrictEqual(calls, []);
	});

	test('should fire onDidChangeAvailableProfiles when available or contributed profiles have changed via remote/localTerminalService', async () => {
		powershellProfile.isDefault = false;
		terminalInstanceService.setProfiles(undefined, [powershellProfile]);
		const calls: ITerminalProfile[][] = [];
		store.add(terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e)));
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(calls, [
			[powershellProfile]
		]);
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
	});

	test('should call refreshAvailableProfiles _onDidChangeExtensions', async () => {
		extensionService._onDidChangeExtensions.fire();
		const calls: ITerminalProfile[][] = [];
		store.add(terminalProfileService.onDidChangeAvailableProfiles(e => calls.push(e)));
		await terminalProfileService.hasRefreshedProfiles;
		deepStrictEqual(calls, [
			[powershellProfile]
		]);
		deepStrictEqual(terminalProfileService.availableProfiles, [powershellProfile]);
		deepStrictEqual(terminalProfileService.contributedProfiles, [jsdebugProfile]);
	});

	test('should unregister terminal profile providers', () => {
		const firstProvider = { createContributedTerminalProfile: async () => undefined };
		const secondProvider = { createContributedTerminalProfile: async () => undefined };
		const registration = terminalProfileService.registerTerminalProfileProvider('first.extension', 'profile', firstProvider);
		store.add(terminalProfileService.registerTerminalProfileProvider('second.extension', 'profile', secondProvider));

		registration.dispose();

		deepStrictEqual(terminalProfileService.getContributedProfileProvider('first.extension', 'profile'), undefined);
		deepStrictEqual(terminalProfileService.getContributedProfileProvider('second.extension', 'profile'), secondProvider);
	});

	suite('Profiles Quickpick', () => {
		let quickInputService: MockQuickInputService;
		let mockTerminalProfileService: MockTerminalProfileService;
		let terminalProfileQuickpick: TestTerminalProfileQuickpick;
		setup(async () => {
			quickInputService = new MockQuickInputService();
			mockTerminalProfileService = new MockTerminalProfileService();
			instantiationService.stub(IQuickInputService, quickInputService);
			instantiationService.stub(ITerminalProfileService, mockTerminalProfileService);
			terminalProfileQuickpick = instantiationService.createInstance(TestTerminalProfileQuickpick);
		});
		test('setDefault', async () => {
			powershellProfile.isDefault = false;
			mockTerminalProfileService.setProfiles([powershellProfile], [jsdebugProfile]);
			mockTerminalProfileService.setDefaultProfileName(jsdebugProfile.title);
			const result = await terminalProfileQuickpick.showAndGetResult('setDefault');
			deepStrictEqual(result, powershellProfile.profileName);
		});
		test('setDefault to contributed', async () => {
			mockTerminalProfileService.setDefaultProfileName(powershellProfile.profileName);
			quickInputService.setPick(jsdebugPick);
			const result = await terminalProfileQuickpick.showAndGetResult('setDefault');
			const expected = {
				config: {
					extensionIdentifier: jsdebugProfile.extensionIdentifier,
					id: jsdebugProfile.id,
					options: { color: undefined, icon: 'debug' },
					title: jsdebugProfile.title,
				},
				keyMods: undefined
			};
			deepStrictEqual(result, expected);
		});

		test('createInstance', async () => {
			mockTerminalProfileService.setDefaultProfileName(powershellProfile.profileName);
			const pick = { ...powershellPick, keyMods: { alt: true, ctrlCmd: false, shift: false } };
			quickInputService.setPick(pick);
			const result = await terminalProfileQuickpick.showAndGetResult('createInstance');
			deepStrictEqual(result, { config: powershellProfile, keyMods: { alt: true, ctrlCmd: false, shift: false } });
		});

		test('open createInstance picker makes a late contributed profile selectable without reopening', async () => {
			const liveQuickInputService = new LiveQuickInputService();
			instantiationService.stub(IQuickInputService, liveQuickInputService);
			const livePicker = instantiationService.createInstance(TestTerminalProfileQuickpick);
			mockTerminalProfileService.setProfiles([powershellProfile], []);
			const result = livePicker.showAndGetResult('createInstance');
			try {
				const opened = await Promise.race([
					liveQuickInputService.shown.then(() => 'shown'),
					result.then(() => 'closed'),
					new Promise<string>(resolve => setTimeout(() => resolve('timeout'), 5000))
				]);
				strictEqual(opened, 'shown', 'profile picker must open before the late contribution');
				deepStrictEqual(liveQuickInputService.visibleProfileNames, [powershellProfile.profileName]);
				mockTerminalProfileService.setProfiles([powershellProfile], [jsdebugProfile]);
				for (let i = 0; i < 20 && !liveQuickInputService.visibleProfileNames.includes(jsdebugProfile.title); i++) {
					await new Promise(resolve => setTimeout(resolve, 10));
				}
				strictEqual(liveQuickInputService.visibleProfileNames.includes(jsdebugProfile.title), true,
					'late contributed profile must appear in the picker that is already open');
				liveQuickInputService.select(jsdebugProfile.title);
				deepStrictEqual(await result, {
					config: {
						extensionIdentifier: jsdebugProfile.extensionIdentifier,
						id: jsdebugProfile.id,
						title: jsdebugProfile.title,
						options: { color: undefined, icon: jsdebugProfile.icon }
					},
					keyMods: undefined
				});
			} finally {
				liveQuickInputService.dismiss();
				liveQuickInputService.dispose();
				await result.catch(() => undefined);
			}
		});

		test('createInstance with contributed', async () => {
			const pick = { ...jsdebugPick, keyMods: { alt: true, ctrlCmd: false, shift: true } };
			quickInputService.setPick(pick);
			const result = await terminalProfileQuickpick.showAndGetResult('createInstance');
			const expected = {
				config: {
					extensionIdentifier: jsdebugProfile.extensionIdentifier,
					id: jsdebugProfile.id,
					options: { color: undefined, icon: 'debug' },
					title: jsdebugProfile.title,
				},
				keyMods: { alt: true, ctrlCmd: false, shift: true }
			};
			deepStrictEqual(result, expected);
		});
	});
});
