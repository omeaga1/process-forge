import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { filterCommands, type PaletteCommand } from '../components/CommandPalette.js';

const cmd = (id: string, title: string, group: string, keywords = ''): PaletteCommand => ({ id, title, group, keywords, run: () => {} });

describe('Command palette', () => {
  const commands = [
    cmd('run', 'Run the simulation', 'Line', 'simulate start'),
    cmd('add-pump', 'Add Centrifugal pump', 'Add equipment', 'pump transfer'),
    cmd('add-tank', 'Add Storage tank', 'Add equipment', 'tank vessel'),
    cmd('open-p101', 'Open Transfer Pump P-101', 'Open a unit', 'pump')
  ];

  it('lists everything for an empty query', () => {
    assert.equal(filterCommands(commands, '  ').length, 4);
  });

  it('matches every word, in any field', () => {
    assert.deepEqual(filterCommands(commands, 'add pump').map((c) => c.id), ['add-pump']);
    assert.deepEqual(filterCommands(commands, 'simulate').map((c) => c.id), ['run']);
  });

  it('ranks a title that starts with the first word above one that only mentions it', () => {
    assert.deepEqual(filterCommands(commands, 'open pump').map((c) => c.id), ['open-p101']);
    assert.equal(filterCommands(commands, 'pump')[0]!.id, 'add-pump');
  });
});
