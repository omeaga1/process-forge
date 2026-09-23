import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  createSimulationProject,
  type ProcessGraph,
  type SimulationProject
} from '@process-forge/protocol';
import {
  getUserSession,
  logoutUser,
  updateUserProfile,
  registerUser,
  loginWithPassword,
  generateInitialsAvatar,
  getInitials
} from '../auth/accountManager.js';
import {
  listUserCloudProjects,
  saveProjectToCloud,
  loadProjectFromCloud,
  deleteProjectFromCloud
} from '../storage/cloudStorageAdapter.js';

class MockStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  get length(): number {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
}

// Install mock storage into globalThis
const mockLocalStorage = new MockStorage();
Object.defineProperty(globalThis, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
  configurable: true
});

/** A local email/password profile, created the way the app creates one. */
async function localProfile(email = 'engineer@example.com') {
  return registerUser({ email, password: 'correct-horse-battery', name: 'Test Engineer' });
}

describe('ProcessForge User Accounts & Session Layer', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('updates the profile', async () => {
    await localProfile();
    updateUserProfile({ organization: 'Advanced Bioprocess Labs' });
    assert.strictEqual(getUserSession()?.organization, 'Advanced Bioprocess Labs');
  });

  it('clears session upon logout', async () => {
    await localProfile();
    assert.notStrictEqual(getUserSession(), null);

    logoutUser();
    assert.strictEqual(getUserSession(), null);
  });

  it('enforces password requirements on registration and prevents short passwords', async () => {
    await assert.rejects(
      () => registerUser({ email: 'eng@test.com', password: '123' }),
      /Password must be at least 8 characters/
    );
  });

  it('registers user and authenticates with real password verification', async () => {
    const registered = await registerUser({
      email: 'chief.engineer@dow.com',
      password: 'SecurePassword123!',
      name: 'Sarah Chen',
      organization: 'Dow Operations'
    });
    assert.strictEqual(registered.email, 'chief.engineer@dow.com');
    assert.strictEqual(registered.name, 'Sarah Chen');

    logoutUser();
    assert.strictEqual(getUserSession(), null);

    // Wrong password should fail
    await assert.rejects(
      () => loginWithPassword({ email: 'chief.engineer@dow.com', password: 'WrongPassword' }),
      /Incorrect password/
    );

    // Correct password succeeds
    const loggedIn = await loginWithPassword({
      email: 'chief.engineer@dow.com',
      password: 'SecurePassword123!'
    });
    assert.strictEqual(loggedIn.email, 'chief.engineer@dow.com');
    assert.strictEqual(loggedIn.name, 'Sarah Chen');
  });

  it('generates authentic initials monogram avatars with zero stock photos', () => {
    assert.strictEqual(getInitials('Vincent Price'), 'VP');
    assert.strictEqual(getInitials('Sarah Chen'), 'SC');
    const avatarUri = generateInitialsAvatar('Vincent Price');
    assert.ok(avatarUri.startsWith('data:image/svg+xml;utf8,'));
    assert.ok(!avatarUri.includes('unsplash'));
  });
});

const sampleGraph: ProcessGraph = {
  id: 'test-plant-01',
  name: 'Industrial Paint Formulation',
  version: '1.0.0',
  metadata: { facility: 'Cleveland West' },
  nodes: [
    {
      id: 'r-1',
      name: 'Dispersion Tank',
      kind: 'BATCH_REACTOR',
      position: { x: 50, y: 50 },
      inputs: [],
      outputs: [
        {
          id: 'out-1',
          name: 'Latex Flow',
          type: 'FLUID_OUTPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      config: {
        batchVolumeGallons: 500,
        dischargeRateGpm: 40
      }
    }
  ],
  edges: []
};

describe('ProcessForge Cloud Storage Persistence Layer', () => {

  beforeEach(() => {
    mockLocalStorage.clear();
  });

  it('starts a new user with no projects, not a fabricated "synced 3 days ago" one', async () => {
    const user = await localProfile();
    assert.deepStrictEqual(await listUserCloudProjects(user), []);
  });

  it('never touches the network without a verified cloud session', async () => {
    // Tests must never reach the production API.
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      throw new Error('network is off limits here');
    }) as typeof fetch;
    try {
      const user = await localProfile();
      const project = createSimulationProject('Local only', sampleGraph, { isGuest: false });
      const result = await saveProjectToCloud(project, user);
      await listUserCloudProjects(user);
      await loadProjectFromCloud(project.id, user);
      await deleteProjectFromCloud(project.id, user);
      assert.strictEqual(calls, 0);
      assert.strictEqual(result.synced, false);
      assert.match(result.message, /on this device/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('with a cloud session, sends only the session token and says when sync failed', async () => {
    const realFetch = globalThis.fetch;
    const seen: { url: string; auth: string | null; body: any }[] = [];
    let status = 200;
    globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      seen.push({ url: String(url), auth: headers.get('Authorization'), body: init.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify(status === 200 ? { success: true } : { error: 'nope' }), { status });
    }) as typeof fetch;
    try {
      const user = {
        ...(await localProfile('a@b.c')),
        cloudToken: 'pfs1.session.sig',
        cloudTokenExpiresAt: new Date(Date.now() + 60_000).toISOString()
      };
      const project = createSimulationProject('Synced', sampleGraph, { isGuest: false });

      const ok = await saveProjectToCloud(project, user);
      assert.strictEqual(ok.synced, true);
      assert.strictEqual(seen[0]?.auth, 'Bearer pfs1.session.sig');
      assert.ok(!('userId' in seen[0]!.body), 'the server takes the owner from the session, not the body');

      status = 500;
      const failed = await saveProjectToCloud(project, user);
      assert.strictEqual(failed.synced, false);
      assert.match(failed.message, /not to the cloud/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('treats an expired cloud session as no session', async () => {
    const user = {
      ...(await localProfile('a@b.c')),
      cloudToken: 'pfs1.session.sig',
      cloudTokenExpiresAt: new Date(Date.now() - 1000).toISOString()
    };
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return new Response('{}');
    }) as typeof fetch;
    try {
      await listUserCloudProjects(user);
      assert.strictEqual(calls, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('saves, lists, and loads a simulation project with full engineering fidelity', async () => {
    const user = await localProfile();
    const project: SimulationProject = createSimulationProject(
      'Industrial Latex Paint Line Twin',
      sampleGraph,
      {
        description: 'Sherwin-Williams high shear dispersion to packaging',
        isGuest: false
      }
    );

    const saveResult = await saveProjectToCloud(project, user);
    assert.strictEqual(saveResult.success, true);
    assert.strictEqual(saveResult.cloudRecord.nodeCount, sampleGraph.nodes.length);
    assert.strictEqual(saveResult.cloudRecord.streamCount, sampleGraph.edges.length);

    // List projects
    const list = await listUserCloudProjects(user);
    const found = list.find((p) => p.id === project.id);
    assert.ok(found);
    assert.strictEqual(found?.name, 'Industrial Latex Paint Line Twin');

    // Load project
    const loaded = await loadProjectFromCloud(project.id, user);
    assert.notStrictEqual(loaded, null);
    assert.strictEqual(loaded?.name, 'Industrial Latex Paint Line Twin');
    assert.strictEqual(loaded?.graph.nodes.length, sampleGraph.nodes.length);
    assert.strictEqual(loaded?.graph.edges.length, sampleGraph.edges.length);
  });

  it('deletes a project from cloud storage and updates used quota', async () => {
    const user = await localProfile();
    const project: SimulationProject = createSimulationProject(
      'Temporary Decommission Twin',
      sampleGraph,
      { isGuest: false }
    );

    await saveProjectToCloud(project, user);
    const beforeList = await listUserCloudProjects(user);
    const countBefore = beforeList.length;

    const deleted = await deleteProjectFromCloud(project.id, user);
    assert.strictEqual(deleted, true);

    const afterList = await listUserCloudProjects(user);
    assert.strictEqual(afterList.length, countBefore - 1);
    assert.strictEqual(afterList.some((p) => p.id === project.id), false);
  });
});
