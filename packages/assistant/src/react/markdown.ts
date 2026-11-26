type Node = { type: string; value?: string; url?: string; children?: Node[] };

/** A remark plugin: citations in prose only, never code or an existing link. */
export function remarkAssistantCitations() {
  return (tree: Node) => {
    function walk(node: Node) {
      if (["link", "linkReference", "code", "inlineCode"].includes(node.type) || !node.children) return;
      node.children = node.children.flatMap(child => {
        if (child.type !== "text" || !child.value) { walk(child); return [child]; }
        const parts: Node[] = [];
        let end = 0;
        for (const match of child.value.matchAll(/\[((?:c_[\w-]+|\d+)(?:[\s,]+(?:c_[\w-]+|\d+))*)\]/g)) {
          parts.push({ type: "text", value: child.value.slice(end, match.index) });
          for (const id of match[1].split(/[\s,]+/)) parts.push({ type: "link", url: `#bold-citation-${id}`, children: [{ type: "text", value: `[${id}]` }] });
          end = match.index! + match[0].length;
        }
        parts.push({ type: "text", value: child.value.slice(end) });
        return parts;
      });
    }
    walk(tree);
  };
}
