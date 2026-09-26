/**
 * Reference copy: spec-guard src/types.ts, main at
 * d0ca38a4dd82292c1e88426744d833e7b605d44b.
 *
 * Lines 10-106 only, verbatim: the types parser.ts imports. The rest of the
 * file imports modules this copy does not need.
 * The differential suites in tests/markdown compare spec-core's scanner
 * against it. Not part of spec-core: never edited, never shipped.
 */

/** Every assertion kind the parser understands. */
export type DirectiveKind =
  | 'assert-absence'
  | 'assert-count'
  | 'assert-present'
  | 'assert-import-absence'
  | 'assert-import-count'
  | 'assert-import-cycle'
  | 'assert-layers'
  | 'assert-structure';

/** What an `@assert-structure` directive claims. Exactly one per directive; see ADR-0013. */
export type StructureClaim = 'pattern' | 'required' | 'partner';

/** The claim of an `@assert-structure` directive, resolved. */
export interface StructureQuery {
  claim: StructureClaim;
  /**
   * The claim's list, as written: the name patterns every file must match, the
   * entries every directory must hold, or the partner templates of which one
   * must exist.
   */
  values: string[];
  /**
   * For `required`, the glob choosing directories below each target. Absent
   * when the rule is about the targets themselves.
   */
  dirs?: string;
}

/** Extra scope carried by the import assertions. */
export interface ImportQuery {
  /** Module patterns, matched with gitignore-style rules. */
  modules: string[];
  /** Whether `import type` / `export type` count as dependencies. */
  includeTypes: boolean;
  /** Whether `import('x')` counts. Only a cycle rule can leave it out (`dynamic="ignore"`). */
  includeDynamic: boolean;
}

/** Source location of a directive inside a spec file. */
export interface SourceLocation {
  /** Absolute path to the spec file. */
  file: string;
  /** Path relative to the root, using forward slashes. Used for display. */
  relativeFile: string;
  /** 1-based line number of the directive's opening `<!--`. */
  line: number;
  /** 1-based column of the directive's opening `<!--`. */
  column: number;
}

/** A raw, syntactically valid directive extracted from Markdown. */
export interface Directive {
  kind: DirectiveKind;
  attributes: Readonly<Record<string, string>>;
  location: SourceLocation;
  /** The raw comment text, useful for error messages. */
  raw: string;
}

/** A directive that could not be parsed (unknown kind, bad attributes, ...). */
export interface DirectiveError {
  location: SourceLocation;
  message: string;
  raw: string;
}

/**
 * A document's declared lifecycle state, as written in the document.
 *
 * ADRs are an historical ledger: one moves from Proposed to Accepted, and later
 * to Superseded, and the superseded text stays on disk because deleting it
 * deletes the reason a decision was made. spec-guard executed every directive
 * it found regardless, which made a draft break CI and made a superseded ADR
 * keep enforcing a rule its own heading says was replaced.
 *
 * See ADR-0010 for why this is read from the document rather than declared per
 * directive, and why an unrecognised word stays in force.
 */
export interface SpecStatus {
  /** The first word, lowercased: `superseded` from "Superseded by ADR-0007". */
  value: string;
  /** The whole line as written, which is what a reader wants to be shown. */
  label: string;
  /** Where in the document it was found. */
  source: 'frontmatter' | 'heading' | 'label';
  /** Whether the directives in this document execute. */
  active: boolean;
}

export interface ParseResult {
  directives: Directive[];
  errors: DirectiveError[];
  /** The document's declared status, when it declares one. */
  status?: SpecStatus;
}
