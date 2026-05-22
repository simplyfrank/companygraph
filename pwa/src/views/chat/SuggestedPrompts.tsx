// Selection-aware suggested prompts (FR-C04, AC-13).
//
// When `selection` is present, substitute the placeholders
// `{selected_node}`, `{selected_edge}`, `{selected_activity}` with
// `selection.label`. When `selection` is null/undefined, filter out any
// prompt that contains an unsubstituted placeholder so we never render
// dangling tokens to the user.

const PLACEHOLDER_RE = /\{selected_(?:node|edge|activity)\}/g;
const PLACEHOLDER_PRESENT_RE = /\{selected_(?:node|edge|activity)\}/;

export interface PromptSelection {
  kind: "node" | "edge";
  id: string;
  label: string;
}

export interface SuggestedPromptsProps {
  prompts: string[];
  selection?: PromptSelection | null;
  onPick: (prompt: string) => void;
}

export function substitutePrompt(
  prompt: string,
  selection: PromptSelection | null | undefined,
): string | null {
  if (!PLACEHOLDER_PRESENT_RE.test(prompt)) return prompt;
  if (!selection) return null;
  return prompt.replace(PLACEHOLDER_RE, selection.label);
}

export function SuggestedPrompts(props: SuggestedPromptsProps) {
  const sel = props.selection ?? null;
  const rendered = props.prompts
    .map((p) => ({ original: p, text: substitutePrompt(p, sel) }))
    .filter((p): p is { original: string; text: string } => p.text !== null);

  if (rendered.length === 0) return null;

  return (
    <div className="suggested-prompts" role="list">
      {rendered.map((p, i) => (
        <button
          key={`${i}-${p.original}`}
          role="listitem"
          type="button"
          className="suggested-prompt pill"
          onClick={() => props.onPick(p.text)}
        >
          {p.text}
        </button>
      ))}
    </div>
  );
}
