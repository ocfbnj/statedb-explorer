import { describe, it, expect } from 'vitest';
import { summarizeJson } from './JsonTree';

/**
 * Unit tests for the smart JSON summary (src/JsonTree.tsx):
 *   - summarizeJson() distills request / response payloads into readable
 *     sections so huge payloads can be understood at a glance.
 */

describe('summarizeJson — response payloads', () => {
  const resp = {
    model: 'deepseek-v4-flash',
    finish_reason: 'tool_calls',
    assistant_message: { role: 'assistant', content: 'Let me check the schema first.' },
    usage: { input_tokens: 1266, output_tokens: 2934, cache_read_tokens: 320768, total_tokens: 324968 },
  };

  it('recognizes a response payload', () => {
    const s = summarizeJson(resp);
    expect(s.kind).toBe('response');
    expect(s.sections.map(x => x.title)).toEqual(['Response', 'Assistant reply', 'Token usage']);
  });

  it('exposes the model and finish reason', () => {
    const s = summarizeJson(resp);
    const first = s.sections[0];
    const model = first.rows.find(r => r.label === 'Model');
    const finish = first.rows.find(r => r.label === 'Finish reason');
    expect(model?.value).toBe('deepseek-v4-flash');
    expect(finish?.value).toBe('tool_calls');
  });

  it('includes the assistant reply content (truncated preview)', () => {
    const s = summarizeJson(resp);
    const reply = s.sections[1];
    const content = reply.rows.find(r => r.label === 'Content');
    expect(content?.value).toContain('Let me check the schema first.');
  });

  it('summarizes token usage with compact numbers', () => {
    const s = summarizeJson(resp);
    const usage = s.sections[2];
    const input = usage.rows.find(r => r.label === 'Input');
    expect(input?.value).toContain('1.3K'); // 1266 -> 1.3K
  });
});

describe('summarizeJson — request payloads', () => {
  const req = {
    method: 'POST',
    body: {
      model: 'deepseek-v4-flash',
      reasoning_effort: 'medium',
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
        { role: 'tool', content: 'result' },
        { role: 'tool', content: 'result2' },
      ],
      tools: [
        { function: { name: 'terminal' } },
        { function: { name: 'read_file' } },
      ],
    },
  };

  it('recognizes a wrapped request payload', () => {
    const s = summarizeJson(req);
    expect(s.kind).toBe('request');
  });

  it('shows method and model in the Request section', () => {
    const s = summarizeJson(req);
    const first = s.sections[0];
    expect(first.rows.find(r => r.label === 'Method')?.value).toBe('POST');
    expect(first.rows.find(r => r.label === 'Model')?.value).toBe('deepseek-v4-flash');
  });

  it('counts messages per role in the Messages section', () => {
    const s = summarizeJson(req);
    const msgs = s.sections.find(x => x.title === 'Messages');
    expect(msgs).toBeDefined();
    const user = msgs!.rows.find(r => r.label === 'user');
    const tool = msgs!.rows.find(r => r.label === 'tool');
    expect(user?.value).toBe('1 msgs');
    expect(tool?.value).toBe('2 msgs');
  });

  it('lists tool names in the Tools section', () => {
    const s = summarizeJson(req);
    const tools = s.sections.find(x => x.title === 'Tools');
    expect(tools).toBeDefined();
    expect(tools!.rows.map(r => r.label)).toEqual(['terminal', 'read_file']);
  });
});

describe('summarizeJson — generic fallback', () => {
  it('falls back to an Overview section for unknown shapes', () => {
    const s = summarizeJson({ foo: 'bar', list: [1, 2, 3] });
    expect(s.kind).toBe('generic');
    expect(s.sections[0].title).toBe('Overview');
    expect(s.sections[0].rows.find(r => r.label === 'foo')?.value).toBe('bar');
    expect(s.sections[0].rows.find(r => r.label === 'list')?.value).toBe('[3 items]');
  });

  it('handles null / primitives gracefully', () => {
    expect(summarizeJson(null).sections[0].title).toBe('Overview');
    expect(summarizeJson('plain string').kind).toBe('generic');
  });
});
