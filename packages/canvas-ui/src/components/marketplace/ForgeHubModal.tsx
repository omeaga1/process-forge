import React, { useState } from 'react';
import { OsakaJadePalette } from '@process-forge/theme';
import type { ProcessNode } from '@process-forge/protocol';

interface ForgeHubPluginItem {
  id: string;
  name: string;
  author: string;
  category: 'PACKAGING' | 'FLUID_PROCESSING' | 'MATERIAL_HANDLING' | 'QUALITY';
  description: string;
  rating: number;
  downloadCount: number;
  nodeTemplate: ProcessNode;
}

const COMMUNITY_PLUGINS: ForgeHubPluginItem[] = [
  {
    id: 'plugin-serac-10-filler',
    name: 'Serac 10-Nozzle Rotary Piston Filler',
    author: 'OEM-Serac Systems',
    category: 'PACKAGING',
    description:
      'High-speed rotary liquid filler with bottom-up dwell cams to eliminate latex paint foaming. Includes dedicated Serac OEM Sub-Agent with automated viscosity compensation.',
    rating: 4.9,
    downloadCount: 1420,
    nodeTemplate: {
      id: 'node-imported-filler',
      name: 'Serac 10-Nozzle Rotary Filler',
      kind: 'ROTARY_FILLER',
      position: { x: 800, y: 350 },
      inputs: [
        {
          id: 'in-fluid',
          name: 'Paint Infeed',
          type: 'FLUID_INPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      outputs: [
        {
          id: 'out-cans',
          name: 'Filled Containers',
          type: 'DISCRETE_OUTPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      config: {
        nozzleCount: 10,
        containerVolumeGallons: 1.0,
        fillTimePerCycleSeconds: 10.0,
        indexTimePerCycleSeconds: 1.8,
        bufferQueueCapacity: 60,
        rejectRatePercentage: 0.5
      },
      assignedSubAgentId: 'subagent-serac-filler'
    }
  },
  {
    id: 'plugin-high-shear-mixer',
    name: 'High-Shear Pigment Dispersion Mixer',
    author: 'CoatingsTech Labs',
    category: 'FLUID_PROCESSING',
    description:
      'Rotor-stator batch dispersion tank for acrylic emulsions and pigment milling. Models non-Newtonian thixotropic fluid breakdown.',
    rating: 4.8,
    downloadCount: 890,
    nodeTemplate: {
      id: 'node-imported-mixer',
      name: 'High-Shear Dispersion Mixer',
      kind: 'BATCH_REACTOR',
      position: { x: 200, y: 350 },
      inputs: [],
      outputs: [
        {
          id: 'out-fluid',
          name: 'Slurry Discharge',
          type: 'FLUID_OUTPUT',
          flowDimension: 'CONTINUOUS_VOLUME'
        }
      ],
      config: {
        batchVolumeGallons: 500,
        fillDurationMinutes: 15,
        reactionDurationMinutes: 30,
        dischargeRateGpm: 40,
        fluid: {
          name: 'Pigment Dispersion Base',
          densityGPerCm3: 1.35,
          viscosityCentipoise: 2200,
          temperatureCelsius: 28
        }
      },
      assignedSubAgentId: 'subagent-high-shear-mixer'
    }
  },
  {
    id: 'plugin-case-packer',
    name: 'PackSys Automatic 24-Can Case Packer',
    author: 'PackSys Global',
    category: 'PACKAGING',
    description:
      'End-of-line case packing cell. Groups 24 one-gallon cans into corrugated trays with hot-melt glue sealing. Built-in jam detection sub-agent.',
    rating: 4.95,
    downloadCount: 2150,
    nodeTemplate: {
      id: 'node-imported-case-packer',
      name: 'PackSys 24-Can Case Packer',
      kind: 'PALLETIZER',
      position: { x: 1500, y: 350 },
      inputs: [
        {
          id: 'in-cans',
          name: 'Cans Infeed',
          type: 'DISCRETE_INPUT',
          flowDimension: 'DISCRETE_CONTAINER'
        }
      ],
      outputs: [],
      config: {
        containersPerLayer: 24,
        layersPerSkid: 1,
        cycleSecondsPerLayer: 32,
        skidChangeoverSeconds: 15
      },
      assignedSubAgentId: 'subagent-case-packer'
    }
  }
];

interface ForgeHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertNode: (node: ProcessNode) => void;
}

export const ForgeHubModal: React.FC<ForgeHubModalProps> = ({ isOpen, onClose, onInsertNode }) => {
  if (!isOpen) return null;

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const filteredPlugins = COMMUNITY_PLUGINS.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.author.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(12, 18, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      <div
        style={{
          width: 820,
          maxHeight: '85vh',
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${OsakaJadePalette.border.strong}`,
          borderRadius: 12,
          boxShadow: '0 16px 40px rgba(0,0,0,0.8)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          color: OsakaJadePalette.text.primary
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: OsakaJadePalette.background.base
          }}
        >
          <div>
            <div style={{ fontSize: 11, color: OsakaJadePalette.jade.glow, fontWeight: 700, textTransform: 'uppercase' }}>
              Community Registry (Obsidian Model)
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: OsakaJadePalette.text.primary, marginTop: 2 }}>
              🏪 ForgeHub Unit-Op & Agent Marketplace
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: `1px solid ${OsakaJadePalette.border.default}`,
              color: OsakaJadePalette.text.secondary,
              fontSize: 16,
              width: 32,
              height: 32,
              borderRadius: '50%',
              cursor: 'pointer'
            }}
          >
            ✕
          </button>
        </div>

        {/* Search & Category Filter Bar */}
        <div
          style={{
            padding: '14px 24px',
            borderBottom: `1px solid ${OsakaJadePalette.border.subtle}`,
            display: 'flex',
            gap: 12,
            backgroundColor: OsakaJadePalette.background.surfaceElevated
          }}
        >
          <input
            type="text"
            placeholder="Search verified community unit ops (e.g. filler, mixer, case packer)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: 1,
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: OsakaJadePalette.text.primary,
              fontSize: 13,
              outline: 'none'
            }}
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              backgroundColor: OsakaJadePalette.background.surface,
              border: `1px solid ${OsakaJadePalette.border.default}`,
              borderRadius: 6,
              padding: '8px 12px',
              color: OsakaJadePalette.text.secondary,
              fontSize: 13,
              outline: 'none'
            }}
          >
            <option value="ALL">All Categories</option>
            <option value="PACKAGING">Packaging Lines</option>
            <option value="FLUID_PROCESSING">Fluid Processing</option>
            <option value="QUALITY">Quality & Inspection</option>
          </select>
        </div>

        {/* Plugin Cards List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16
          }}
        >
          {filteredPlugins.map((plugin) => (
            <div
              key={plugin.id}
              style={{
                backgroundColor: OsakaJadePalette.background.surfaceElevated,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: OsakaJadePalette.text.primary }}>
                    {plugin.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      backgroundColor: OsakaJadePalette.jade.muted,
                      color: OsakaJadePalette.jade.glow,
                      padding: '2px 6px',
                      borderRadius: 4,
                      fontWeight: 600
                    }}
                  >
                    {plugin.category}
                  </span>
                </div>

                <div style={{ fontSize: 11, color: OsakaJadePalette.text.muted, marginBottom: 6 }}>
                  By {plugin.author} • ★ {plugin.rating} ({plugin.downloadCount} installs)
                </div>

                <div style={{ fontSize: 12, color: OsakaJadePalette.text.secondary, lineHeight: '1.4' }}>
                  {plugin.description}
                </div>
              </div>

              <button
                onClick={() => {
                  const uniqueId = `${plugin.nodeTemplate.id}-${Date.now()}`;
                  onInsertNode({ ...plugin.nodeTemplate, id: uniqueId });
                  onClose();
                }}
                style={{
                  backgroundColor: OsakaJadePalette.jade[500],
                  color: OsakaJadePalette.text.inverse,
                  border: 'none',
                  borderRadius: 6,
                  padding: '10px 18px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                + Insert into Sim
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
