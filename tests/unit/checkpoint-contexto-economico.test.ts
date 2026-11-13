import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Guarda a fronteira real: o fechamento mantém o histórico mas não paga
// novamente o prompt de vendas. Não mede a qualidade semântica do modelo.
function fechamento(fonte: string) {
  const ast = ts.createSourceFile('turn.ts', fonte, ts.ScriptTarget.Latest, true);
  const encontrados: ts.ObjectLiteralExpression[] = [];
  function visitar(n: ts.Node) {
    if (ts.isCallExpression(n) && n.expression.getText(ast) === 'runModelCall') {
      const args = n.arguments[2];
      if (args && ts.isObjectLiteralExpression(args) && args.properties.some(p =>
        ts.isPropertyAssignment(p) && p.name.getText(ast) === 'purpose' &&
        ts.isStringLiteral(p.initializer) && p.initializer.text === 'checkpoint')) {
        encontrados.push(args);
      }
    }
    ts.forEachChild(n, visitar);
  }
  visitar(ast);
  return encontrados.map(args => Object.fromEntries(args.properties.flatMap(p =>
    ts.isPropertyAssignment(p) ? [[p.name.getText(ast), p.initializer.getText(ast)]] :
    ts.isShorthandPropertyAssignment(p) ? [[p.name.text, p.name.text]] : [])));
}

describe('o fechamento recebe somente sua instrução de sistema', () => {
  it('preserva histórico, ferramentas e recuperação, sem reenviar a persona', () => {
    const fonte = readFileSync('lib/agent-engine/agent/inbound-turn.ts', 'utf8');
    const chamadas = fechamento(fonte);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.system).toBe('CHECKPOINT_SYSTEM');
    expect(chamadas[0]?.messages).toContain('...openingTextOnly');
    expect(chamadas[0]?.messages).toContain('...responseMessages');
    expect(chamadas[0]?.messages).toContain('CHECKPOINT_INSTRUCTION');
    expect(chamadas[0]?.tools).toBeUndefined();
  });

  it('controle negativo: distingue o prompt de vendas do prompt de fechamento', () => {
    const antes = "runModelCall(pool, cfg, {purpose: 'checkpoint', system, messages: []})";
    expect(fechamento(antes)[0]?.system).not.toBe('CHECKPOINT_SYSTEM');
    expect(fechamento(antes.replace('system,', 'system: CHECKPOINT_SYSTEM,'))[0]?.system)
      .toBe('CHECKPOINT_SYSTEM');
    expect(fechamento("runModelCall(pool, cfg, {purpose: 'agent_turn', system})")).toEqual([]);
  });
});
