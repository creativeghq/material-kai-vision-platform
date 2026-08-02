import { describe, it, expect } from 'vitest';
import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Prop-contract guard — the prevention layer for the finance wiring sweep.
 *
 * The whole "component accepts context as a prop but no caller passes it" class (RecordPaymentDialog
 * had an `orderId` prop with no picker + callers that dropped it, NewSupplierBillDialog had no
 * prefill anyone used, …) is invisible to typecheck and to the money-path integration tests. It is,
 * however, statically detectable: an OPTIONAL prop on a wiring-sensitive component that ZERO callers
 * ever pass is either dead (delete it) or unwired (pass it). This test fails when a watched
 * component grows such a prop, so the gap is caught at PR time instead of by a later audit.
 *
 * Scope is an explicit allowlist — this is a targeted contract on the components where dropping
 * context silently costs money/data, NOT a whole-repo lint (which would be noisy).
 */

const SRC = path.resolve(__dirname, '../../src');

// Components whose optional props MUST each be passed by at least one caller. `allowUnwired` lists
// props that are intentionally never-yet-passed (kept with a reason), so the guard stays green
// while still catching NEW unwired props.
const WATCHED: Array<{ file: string; name: string; allowUnwired?: string[] }> = [
  { file: 'modules/finance/components/RecordPaymentDialog.tsx', name: 'RecordPaymentDialog' },
  // NewSupplierBillDialog was folded into NewExpenseDialog and deleted — an expense IS a
  // supplier bill, so there was never a second form to keep.
  { file: 'modules/finance/components/NewExpenseDialog.tsx', name: 'NewExpenseDialog' },
  // PaySupplierBillDialog was folded into RecordPaymentDialog's expense branch and deleted —
  // there is one Record Payment form now, so there is nothing separate left to guard here.
  { file: 'modules/finance/components/NewChequeDialog.tsx', name: 'NewChequeDialog' },
  { file: 'modules/finance/components/CustomerFinanceTabs.tsx', name: 'PartyPaymentsCard' },
];

// ── AST helpers ──────────────────────────────────────────────────────────────
function parse(file: string): ts.SourceFile {
  const text = fs.readFileSync(file, 'utf8');
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

function* walk(node: ts.Node): Generator<ts.Node> {
  yield node;
  for (const c of node.getChildren()) yield* walk(c);
}

/** Collect local `interface X {}` / `type X = {}` type-literal members so a React.FC<X> resolves. */
function collectLocalTypes(sf: ts.SourceFile): Map<string, ts.TypeLiteralNode> {
  const map = new Map<string, ts.TypeLiteralNode>();
  for (const n of walk(sf)) {
    if (ts.isInterfaceDeclaration(n)) {
      // Treat an interface body as a type literal for member extraction.
      map.set(n.name.text, { members: n.members } as unknown as ts.TypeLiteralNode);
    } else if (ts.isTypeAliasDeclaration(n) && ts.isTypeLiteralNode(n.type)) {
      map.set(n.name.text, n.type);
    }
  }
  return map;
}

/** Optional-prop names from a props type node, resolving TypeLiterals, local refs, and intersections. */
function optionalProps(typeNode: ts.TypeNode | undefined, locals: Map<string, ts.TypeLiteralNode>): Set<string> {
  const out = new Set<string>();
  const visit = (t: ts.TypeNode | undefined) => {
    if (!t) return;
    if (ts.isTypeLiteralNode(t) || (t as any).members) {
      for (const m of (t as ts.TypeLiteralNode).members) {
        if (ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name) && m.questionToken) out.add(m.name.text);
      }
    } else if (ts.isIntersectionTypeNode(t)) {
      t.types.forEach(visit);
    } else if (ts.isTypeReferenceNode(t) && ts.isIdentifier(t.typeName)) {
      const local = locals.get(t.typeName.text);
      if (local) visit(local as unknown as ts.TypeNode);
    }
  };
  visit(typeNode);
  return out;
}

/** The props type argument of `const Name: React.FC<T>` (or `FC<T>`). */
function propsTypeForComponent(sf: ts.SourceFile, name: string): ts.TypeNode | undefined {
  for (const n of walk(sf)) {
    if (ts.isVariableDeclaration(n) && n.name && ts.isIdentifier(n.name) && n.name.text === name && n.type
      && ts.isTypeReferenceNode(n.type) && n.type.typeArguments?.length) {
      const tn = n.type.typeName;
      const label = ts.isQualifiedName(tn) ? tn.right.text : (ts.isIdentifier(tn) ? tn.text : '');
      if (label === 'FC' || label === 'FunctionComponent') return n.type.typeArguments[0];
    }
  }
  return undefined;
}

// ── Whole-src usage scan: which attributes each component is called with ───────
function allTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...allTsxFiles(p));
    else if (e.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

type Usage = { attrs: Set<string>; hasSpread: boolean; count: number };
function scanUsages(names: Set<string>): Map<string, Usage> {
  const usage = new Map<string, Usage>();
  for (const n of names) usage.set(n, { attrs: new Set(), hasSpread: false, count: 0 });
  for (const file of allTsxFiles(SRC)) {
    const sf = parse(file);
    for (const n of walk(sf)) {
      let tag: ts.JsxTagNameExpression | undefined; let props: ts.JsxAttributes | undefined;
      if (ts.isJsxOpeningElement(n)) { tag = n.tagName; props = n.attributes; }
      else if (ts.isJsxSelfClosingElement(n)) { tag = n.tagName; props = n.attributes; }
      if (!tag || !props || !ts.isIdentifier(tag)) continue;
      const u = usage.get(tag.text);
      if (!u) continue;
      u.count++;
      for (const a of props.properties) {
        if (ts.isJsxSpreadAttribute(a)) u.hasSpread = true;
        else if (ts.isJsxAttribute(a) && ts.isIdentifier(a.name)) u.attrs.add(a.name.text);
      }
    }
  }
  return usage;
}

describe('prop-contract guard · wiring-sensitive components', () => {
  const usage = scanUsages(new Set(WATCHED.map((w) => w.name)));

  for (const w of WATCHED) {
    it(`${w.name}: every optional prop is passed by at least one caller`, () => {
      // A watched component that has been deleted or moved must say so. Fall through to
      // readFileSync and the whole suite dies on a raw ENOENT, which skips deploy-functions
      // in CI — a stale entry here then silently stops shipping edge functions.
      const abs = path.join(SRC, w.file);
      expect(
        fs.existsSync(abs),
        `${w.name} is on the watch list but ${w.file} does not exist. If it was deleted or ` +
          `folded into another component, remove its entry from WATCHED; if it moved, update the path.`,
      ).toBe(true);
      const sf = parse(abs);
      const locals = collectLocalTypes(sf);
      const propsType = propsTypeForComponent(sf, w.name);
      expect(propsType, `could not resolve ${w.name}'s props type`).toBeTruthy();

      const optional = optionalProps(propsType, locals);
      const u = usage.get(w.name)!;
      // A spread caller (<X {...p} />) could be passing anything — don't flag under that ambiguity.
      if (u.hasSpread) return;
      expect(u.count, `${w.name} is never rendered anywhere — dead component?`).toBeGreaterThan(0);

      const allowed = new Set(w.allowUnwired ?? []);
      const unwired = [...optional].filter((p) => !u.attrs.has(p) && !allowed.has(p));
      expect(
        unwired,
        `${w.name} declares optional prop(s) no caller passes — wire them at the call sites or ` +
        `remove them (add to allowUnwired only with a documented reason): ${unwired.join(', ')}`,
      ).toEqual([]);
    });
  }
});
