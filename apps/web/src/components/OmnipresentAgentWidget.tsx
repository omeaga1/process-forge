import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Send,
  X,
  ChevronUp,
  ChevronDown,
  Loader2,
  Cpu,
  ArrowRight
} from 'lucide-react';
import {
  useTheme,
  getLlmCredentials,
  hasValidCredentials,
  dispatchMasterOrchestratorMessage,
  createDefaultProcessNode,
  useAssistantRoute,
  claudeDesktopFlowsheetPrompt,
  type ChatMessage
} from '@process-forge/canvas-ui';
import type { SimulationProject, ProcessNode } from '@process-forge/protocol';
import { draftingRadius } from '@process-forge/theme';

interface OmnipresentAgentWidgetProps {
  currentProject: SimulationProject;
  onOpenStudio?: () => void;
  onOpenAiModal: () => void;
  isInStudioView?: boolean;
  /**
   * Places a node on the flowsheet. Without this the widget could only DESCRIBE
   * a placement: it used to reply "Instantiated Centrifugal Pump P-003 on
   * flowsheet canvas" and never read res.createdNode, so nothing was placed.
   */
  onAddNode?: (node: ProcessNode) => void;
}

export const OmnipresentAgentWidget: React.FC<OmnipresentAgentWidgetProps> = ({
  currentProject,
  onOpenStudio,
  onOpenAiModal,
  isInStudioView = false,
  onAddNode
}) => {
  const { palette } = useTheme();
  const OsakaJadePalette = palette;
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [inputText, setInputText] = useState<string>('');
  const route = useAssistantRoute();
  const [handoffCopied, setHandoffCopied] = useState(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [creds, setCreds] = useState(() => getLlmCredentials());
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleStorage = () => setCreds(getLlmCredentials());
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExpanded]);

  if (isInStudioView) return null;

  const hasKey = hasValidCredentials(creds);

  /**
   * The engineer picked one of the options offered for an ambiguous request.
   * Create exactly that, and clear the question so it cannot be answered twice.
   */
  const resolveClarification = (
    messageId: string,
    option: NonNullable<ChatMessage['clarification']>['options'][number],
    flowRateGpm?: number
  ) => {
    const node = createDefaultProcessNode(option.kind, {
      name: option.name,
      ...(flowRateGpm !== undefined ? { flowRateGpm } : {})
    });
    onAddNode?.(node);
    setMessages((prev) => [
      ...prev.map((m) => (m.id === messageId ? { ...m, clarification: undefined } : m)),
      {
        id: `agent-${Date.now()}`,
        sender: 'master_orchestrator',
        senderTitle: 'Plant Orchestrator',
        text: `Added ${option.name}.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelBadge: 'Engineer choice',
        createdNode: node
      }
    ]);
  };

  const handleSendMessage = async (customPrompt?: string) => {
    const text = customPrompt || inputText;
    if (!text.trim() || isProcessing) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      senderTitle: 'Process Engineer',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setInputText('');
    setIsProcessing(true);

    try {
      const res = await dispatchMasterOrchestratorMessage(text, {
        graphName: currentProject.graph.name,
        nodeCount: currentProject.graph.nodes.length,
        totalPackaged: 0,
        averageRatePerMin: 0
      });

      if (res.createdNode) {
        onAddNode?.(res.createdNode);
      }

      const agentMsg: ChatMessage = {
        id: `agent-${Date.now()}`,
        sender: 'master_orchestrator',
        senderTitle: 'Plant Orchestrator',
        text: res.text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        modelBadge: res.senderBadge,
        ...(res.createdNode ? { createdNode: res.createdNode } : {}),
        ...(res.clarification ? { clarification: res.clarification } : {})
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'master_orchestrator',
          senderTitle: 'Error',
          text: `[Error]: ${err.message || 'Failed to communicate with model provider'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  const modelDisplayLabel = hasKey
    ? `${creds.provider.toUpperCase()}`
    : 'No Model Linked';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 18,
        right: isInStudioView ? 52 : 24, // avoid colliding with dock toggle in studio
        zIndex: 90,
        fontFamily: 'Inter, system-ui, sans-serif'
      }}
    >
      {/* Expanded Floating Assistant Drawer */}
      {isExpanded && (
        <div
          style={{
            position: 'absolute',
            bottom: 48,
            right: 0,
            width: 380,
            maxWidth: 'calc(100vw - 32px)',
            height: 480,
            backgroundColor: OsakaJadePalette.background.surface,
            border: `1px solid ${OsakaJadePalette.border.glow}`,
            borderRadius: draftingRadius.sharp,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            animation: 'fadeIn 0.15s ease-out'
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 14px',
              backgroundColor: OsakaJadePalette.background.canvas,
              borderBottom: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: draftingRadius.soft,
                  backgroundColor: OsakaJadePalette.jade.muted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: `1px solid ${OsakaJadePalette.jade[600]}`
                }}
              >
                <Sparkles size={14} color={OsakaJadePalette.jade[400]} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: OsakaJadePalette.text.primary, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>Master Process Orchestrator</span>
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: hasKey ? OsakaJadePalette.jade[500] : '#f59e0b',
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: OsakaJadePalette.text.muted }}>
                  Active Plant: {currentProject.name.slice(0, 28)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={onOpenAiModal}
                style={{
                  background: 'none',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: draftingRadius.soft,
                  padding: '3px 6px',
                  color: OsakaJadePalette.text.secondary,
                  fontSize: 10,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
                title="Configure Model Subscriptions"
              >
                <Cpu size={11} />
                <span>{modelDisplayLabel}</span>
              </button>

              <button
                onClick={() => setIsExpanded(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: OsakaJadePalette.text.muted,
                  cursor: 'pointer',
                  padding: 4
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick Studio Jump Banner (When not in studio) */}
          {!isInStudioView && onOpenStudio && (
            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.08)',
                borderBottom: `1px solid rgba(16, 185, 129, 0.2)`,
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: 11
              }}
            >
              <span style={{ color: OsakaJadePalette.text.accent }}>Flowsheet active in memory</span>
              <button
                onClick={() => {
                  setIsExpanded(false);
                  onOpenStudio();
                }}
                style={{
                  background: OsakaJadePalette.jade[600],
                  border: 'none',
                  borderRadius: draftingRadius.soft,
                  color: '#fff',
                  padding: '3px 8px',
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <span>Open Studio</span>
                <ArrowRight size={11} />
              </button>
            </div>
          )}

          {/* Conversation Area */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}
          >
            {messages.map((m) => {
              const isUser = m.sender === 'user';
              return (
                <div
                  key={m.id}
                  style={{
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    backgroundColor: isUser
                      ? 'rgba(16, 185, 129, 0.15)'
                      : OsakaJadePalette.background.canvas,
                    border: `1px solid ${isUser ? OsakaJadePalette.jade[600] : OsakaJadePalette.border.default}`,
                    borderRadius: draftingRadius.soft,
                    padding: '8px 10px',
                    fontSize: 12,
                    lineHeight: 1.45,
                    color: OsakaJadePalette.text.primary
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      color: isUser ? OsakaJadePalette.text.accent : OsakaJadePalette.text.secondary,
                      marginBottom: 3,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <span>{m.senderTitle || (isUser ? 'You' : 'Orchestrator')}</span>
                    {m.modelBadge && (
                      <span
                        style={{
                          fontSize: 9,
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          padding: '1px 4px',
                          borderRadius: draftingRadius.soft,
                          color: OsakaJadePalette.text.muted
                        }}
                      >
                        {m.modelBadge}
                      </span>
                    )}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                  {m.clarification && (
                    <div
                      role="group"
                      aria-label="Which equipment should be added?"
                      style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}
                    >
                      {m.clarification.options.map((option) => (
                        <button
                          key={option.kind}
                          onClick={() => resolveClarification(m.id, option, m.clarification?.flowRateGpm)}
                          title={`Add ${option.name}`}
                          style={{
                            padding: '4px 9px',
                            borderRadius: draftingRadius.soft,
                            backgroundColor: 'transparent',
                            color: OsakaJadePalette.text.primary,
                            border: `1px solid ${OsakaJadePalette.border.default}`,
                            fontSize: 11,
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          Add {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            {isProcessing && (
              <div
                style={{
                  alignSelf: 'flex-start',
                  backgroundColor: OsakaJadePalette.background.canvas,
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: draftingRadius.soft,
                  padding: '8px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: OsakaJadePalette.text.muted
                }}
              >
                <Loader2 size={14} className="animate-spin" color={OsakaJadePalette.jade.glow} />
                <span>Orchestrator thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Prompts */}
          <div
            style={{
              padding: '6px 10px',
              backgroundColor: OsakaJadePalette.background.canvas,
              borderTop: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              gap: 6,
              overflowX: 'auto'
            }}
          >
            {[
              'Audit line bottleneck',
              'Sizing for 120 cpm line',
              'ASME nozzle rules'
            ].map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(p)}
                disabled={isProcessing}
                style={{
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: `1px solid ${OsakaJadePalette.border.default}`,
                  borderRadius: draftingRadius.soft,
                  padding: '3px 8px',
                  color: OsakaJadePalette.text.secondary,
                  fontSize: 10,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Claude Desktop: a hand-off instead of a chat box that cannot answer */}
          {route === 'claude-desktop' && (
            <div
              style={{
                padding: 10,
                backgroundColor: OsakaJadePalette.background.surface,
                borderTop: `1px solid ${OsakaJadePalette.border.default}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 6
              }}
            >
              <span style={{ fontSize: 11, color: OsakaJadePalette.text.secondary }}>
                You chat in Claude Desktop. Hand it this flowsheet with your question.
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  aria-label="Question for Claude Desktop"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Your question (optional)"
                  style={{
                    flex: 1,
                    backgroundColor: OsakaJadePalette.background.canvas,
                    border: `1px solid ${OsakaJadePalette.border.default}`,
                    borderRadius: draftingRadius.soft,
                    padding: '6px 10px',
                    fontSize: 12,
                    color: OsakaJadePalette.text.primary,
                    outline: 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(claudeDesktopFlowsheetPrompt(currentProject.graph, inputText));
                    setHandoffCopied(true);
                    setTimeout(() => setHandoffCopied(false), 2500);
                  }}
                  style={{
                    backgroundColor: OsakaJadePalette.jade[600],
                    border: 'none',
                    borderRadius: draftingRadius.soft,
                    padding: '0 10px',
                    color: '#fff',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {handoffCopied ? 'Copied' : 'Copy for Claude'}
                </button>
              </div>
            </div>
          )}

          {/* Input Area */}
          {route !== 'claude-desktop' && (
          <div
            style={{
              padding: 10,
              backgroundColor: OsakaJadePalette.background.surface,
              borderTop: `1px solid ${OsakaJadePalette.border.default}`,
              display: 'flex',
              gap: 6
            }}
          >
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendMessage();
              }}
              placeholder="Ask the Master Orchestrator..."
              style={{
                flex: 1,
                backgroundColor: OsakaJadePalette.background.canvas,
                border: `1px solid ${OsakaJadePalette.border.default}`,
                borderRadius: draftingRadius.soft,
                padding: '6px 10px',
                fontSize: 12,
                color: OsakaJadePalette.text.primary,
                outline: 'none'
              }}
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={!inputText.trim() || isProcessing}
              style={{
                backgroundColor: inputText.trim() && !isProcessing ? OsakaJadePalette.jade[600] : 'rgba(255,255,255,0.05)',
                border: 'none',
                borderRadius: draftingRadius.soft,
                padding: '0 10px',
                color: '#fff',
                cursor: inputText.trim() && !isProcessing ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Send size={14} />
            </button>
          </div>
          )}
        </div>
      )}

      {/* Floating Pill Button */}
      <button
        onClick={() => setIsExpanded((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 14px',
          borderRadius: draftingRadius.sharp,
          backgroundColor: OsakaJadePalette.background.surface,
          border: `1px solid ${isExpanded ? OsakaJadePalette.jade.glow : OsakaJadePalette.border.glow}`,
          color: OsakaJadePalette.text.primary,
          cursor: 'pointer',
          transition: 'all 0.15s ease'
        }}
        title="Master Process Orchestrator (Always Visible AI Companion)"
      >
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: OsakaJadePalette.jade.muted,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${OsakaJadePalette.jade[500]}`
          }}
        >
          <Sparkles size={12} color={OsakaJadePalette.jade[400]} />
        </div>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: OsakaJadePalette.text.primary, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>Process Copilot</span>
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                backgroundColor: hasKey ? OsakaJadePalette.jade[500] : '#f59e0b'
              }}
            />
          </div>
          <div style={{ fontSize: 9, color: OsakaJadePalette.text.muted }}>
            {modelDisplayLabel}
          </div>
        </div>
        {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
      </button>
    </div>
  );
};
