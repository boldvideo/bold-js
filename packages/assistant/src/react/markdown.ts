type Node = { type: string; value?: string; url?: string; children?: Node[];
  data?: { hName: string; hProperties: Record<string, string | undefined> } };
export interface AssistantCitationOptions {
  resolve?: (id: string) => { text: string; title: string; href?: string; canSeek: boolean } | undefined;
}

/** A remark plugin: citations in prose only, never code or an existing link. */
export function remarkAssistantCitations(options: AssistantCitationOptions = {}) {
  return (tree: Node) => {
    function walk(node: Node) {
      if (["link", "linkReference", "code", "inlineCode"].includes(node.type) || !node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text" || !child.value) { walk(child); return [child]; }
        const parts: Node[] = [];
        let end = 0;
        for (const match of child.value.matchAll(/\[((?:c_[\w-]+|\d+)(?:[\s,]+(?:c_[\w-]+|\d+))*)\]/g)) {
          parts.push({ type: "text", value: child.value.slice(end, match.index) });
          for (const id of match[1].split(/[\s,]+/)) {
            const resolved = options.resolve?.(id);
            if (options.resolve && !resolved) { parts.push({ type: "text", value: `[${id}]` }); continue; }
            parts.push({ type: "link", url: resolved?.href ?? `#bold-citation-${id}`,
              children: [{ type: "text", value: resolved?.text ?? `[${id}]` }],
              ...(resolved ? { data: {
                hName: resolved.href ? "a" : resolved.canSeek ? "button" : "span",
                hProperties: { href: resolved.href, type: resolved.canSeek && !resolved.href ? "button" : undefined,
                  className: "bold-assistant-citation", "aria-label": resolved.title, "data-citation": id },
              } } : {}),
            });
          }
          end = match.index! + match[0].length;
        }
        parts.push({ type: "text", value: child.value.slice(end) });
        return parts;
      });
    }
    walk(tree);
  };
}
