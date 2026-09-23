import type { ProcessNode } from '@process-forge/protocol';

export interface PackageUnitOpParams {
  node: ProcessNode;
  author: string;
  description: string;
  category: 'FILLING' | 'REACTION' | 'PACKAGING' | 'SEPARATION' | 'CONVEYANCE' | 'MATERIAL_HANDLING';
  tags?: string[];
  requiredCapabilities?: string[];
}

export interface ForgeHubPackageBundle {
  bundleVersion: string;
  pluginId: string;
  name: string;
  author: string;
  description: string;
  category: string;
  tags: string[];
  nodeTemplate: ProcessNode;
  subAgentPersona: {
    roleName: string;
    systemPrompt: string;
  };
  requiredCapabilities: string[];
  serializedBundle: string;
}

export type CommunityUnitOpPackageBundle = ForgeHubPackageBundle;

export function executePackageUnitOp(params: PackageUnitOpParams): ForgeHubPackageBundle {
  const { node, author, description, category, tags = [], requiredCapabilities = [] } = params;
  const pluginId = `pfu-${node.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-v1`;

  const bundle: ForgeHubPackageBundle = {
    bundleVersion: '1.0.0',
    pluginId,
    name: node.name,
    author,
    description,
    category,
    tags: [...tags, category.toLowerCase(), 'process-forge-unit-op'],
    nodeTemplate: node,
    subAgentPersona: {
      roleName: `${node.name} Engineering Specialist`,
      systemPrompt: `You are the dedicated software engineer and domain specialist for ${node.name} (${node.kind}). Assist industrial operators in parameter sizing, fluid compatibility, and backpressure mitigation.`
    },
    requiredCapabilities: requiredCapabilities.length > 0 ? requiredCapabilities : ['@forge/pkg-discrete-packaging'],
    serializedBundle: ''
  };

  bundle.serializedBundle = JSON.stringify(bundle, null, 2);
  return bundle;
}
