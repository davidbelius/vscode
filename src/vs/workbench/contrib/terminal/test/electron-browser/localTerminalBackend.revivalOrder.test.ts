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
import { ILocalPtyService, ITerminalLogService, ISerializedTerminalState } from '../../../../../platform/terminal/common/terminal.js';
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

 test('an editor attach waits for persisted local ptys to revive', async () => {
  const environmentStarted = new DeferredPromise<void>();
  const releaseEnvironment = new DeferredPromise<{ PATH: string }>();
  const revivedIds = new Map<number, number>();
  const livePtys = new Map<number, number>();
  const attachRequests: [number, number | undefined][] = [];
  let revivalCalls = 0;

  const services = store.add(new TestInstantiationService());
  const storage = store.add(new TestStorageService());
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
    await environmentStarted.complete();
    return releaseEnvironment.p;
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
    deepStrictEqual(states.map(state => state.id), [2]);
    revivedIds.set(2, 5);
    livePtys.set(5, 5005);
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
  storage.store(TerminalStorageKeys.TerminalBufferState, JSON.stringify({
   version: 1,
   state: [{
    id: 2,
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

  const backend = store.add(services.createInstance(LocalTerminalBackend));
  const connected = new DeferredPromise<void>();
  await connected.complete();
  Reflect.set(backend, '_directProxyClientEventually', connected);

  // The editor serializer can request its saved terminal while the layout path
  // is still resolving the environment for persisted buffer revival.
  const layout = backend.getTerminalLayoutInfo();
  await environmentStarted.p;
  const racingAttach = backend.attachToRevivedProcess(2, 2222);
  // Drain only already-queued promise continuations. Revival remains blocked
  // by the explicit gate above; no wall-clock sleep decides the outcome.
  for (let i = 0; i < 8; i++) {
   await Promise.resolve();
  }
  await releaseEnvironment.complete({ PATH: '/base/bin' });
  await layout;
  const racingPty = await racingAttach;
  if (racingPty instanceof LocalPty) {
   store.add(racingPty);
  }
  // Control: the ordinary post-revival lookup works with the same saved ID.
  const controlPty = await backend.attachToRevivedProcess(2, 2222);
  if (controlPty instanceof LocalPty) {
   store.add(controlPty);
  }
  deepStrictEqual({ controlId: controlPty?.id, revivalCalls }, { controlId: 5, revivalCalls: 1 });
  deepStrictEqual({ racingId: racingPty?.id, finalRequest: attachRequests.at(-1) },
   { racingId: 5, finalRequest: [5, undefined] });
 });
});
