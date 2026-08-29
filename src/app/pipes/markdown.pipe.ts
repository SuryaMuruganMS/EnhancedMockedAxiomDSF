import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Converts Markdown text to sanitized HTML for rendering in templates.
 * Comprehensive renderer supporting headings, bold/italic, lists (nested),
 * tables, code blocks, blockquotes, horizontal rules, links, and more.
 */
@Pipe({ name: 'markdown', standalone: true })
export class MarkdownPipe implements PipeTransform {

  constructor(private sanitizer: DomSanitizer) {}

  transform(value: string | null | undefined): SafeHtml {
    if (!value) return '';
    return this.sanitizer.bypassSecurityTrustHtml(this.render(value));
  }

  private render(md: string): string {
    // ── Step 0: Normalize line endings and unescape JSON artifacts ──
    let text = md.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Handle double-escaped newlines from JSON.stringify
    text = text.replace(/\\n/g, '\n');
    // Trim leading/trailing whitespace to prevent phantom spacers
    text = text.trim();

    // ── Step 1: Extract code blocks before escaping ──────────
    const codeBlocks: string[] = [];

    // Handle unclosed code blocks at end of content (agent output truncation).
    // Add a closing ``` if the last opening ``` has no matching close.
    // Opening fence: ```lang or just ``` at start of line; closing fence: bare ```
    const fenceMatches = [...text.matchAll(/^```\w*\s*$/gm)];
    if (fenceMatches.length % 2 !== 0) {
      text = text.trimEnd() + '\n```';
    }

    text = text.replace(/```(\w*)\s*\n([\s\S]*?)```/g, (_m, lang, code) => {
      // If the outer wrapper is ```markdown or ```md, strip the fence and
      // render the content as markdown (the agent sometimes wraps its entire
      // output inside a markdown code block).
      if (lang === 'markdown' || lang === 'md') {
        // Recursively render the inner content as markdown
        codeBlocks.push(this.render(code));
        return `\n%%CODEBLOCK_${codeBlocks.length - 1}%%\n`;
      }

      const isMermaid = lang === 'mermaid' || this.isMermaidContent(code);
      if (isMermaid) {
        // Mermaid diagrams: sanitize common syntax issues, then render as div
        const mermaidCode = code.trim();
        const sanitized = this.sanitizeMermaid(mermaidCode);
        // HTML-escape so the browser doesn't mangle mermaid syntax
        // (e.g., < > in class diagrams like <<interface>>, <br> in labels).
        // mermaid.run() reads textContent which auto-decodes entities back.
        const escaped = sanitized.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(
          `<figure class="md-diagram"><figcaption>Diagram · mermaid</figcaption><pre class="mermaid">${escaped}</pre></figure>`
        );
      } else {
        const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        codeBlocks.push(
          `<pre class="md-code-block"><code class="lang-${lang || 'text'}">${escaped.trim()}</code></pre>`
        );
      }
      return `\n%%CODEBLOCK_${codeBlocks.length - 1}%%\n`;
    });

    // ── Step 2: Extract inline code before escaping ──────────
    const inlineCodes: string[] = [];
    text = text.replace(/`([^`]+)`/g, (_m, code) => {
      const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      inlineCodes.push(`<code class="md-inline-code">${escaped}</code>`);
      return `%%INLINECODE_${inlineCodes.length - 1}%%`;
    });

    // ── Step 3: Escape HTML entities ─────────────────────────
    text = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // ── Step 4: Process tables (multi-line construct) ────────
    const tableBlocks: string[] = [];
    text = this.extractTables(text, tableBlocks);

    // ── Step 5: Process line by line ─────────────────────────
    const lines = text.split('\n');
    const result: string[] = [];
    const listStack: string[] = []; // stack of 'ul' | 'ol'
    let inBlockquote = false;
    let blockquoteLines: string[] = [];

    const closeAllLists = () => {
      while (listStack.length > 0) {
        result.push(listStack.pop() === 'ul' ? '</ul>' : '</ol>');
      }
    };

    const flushBlockquote = () => {
      if (inBlockquote && blockquoteLines.length > 0) {
        result.push(`<blockquote class="md-blockquote">${blockquoteLines.map(l => this.inlineFormat(l)).join('<br>')}</blockquote>`);
        blockquoteLines = [];
      }
      inBlockquote = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // ── Code block placeholder ─────────────────────────────
      const codeMatch = trimmed.match(/^%%CODEBLOCK_(\d+)%%$/);
      if (codeMatch) {
        flushBlockquote();
        closeAllLists();
        result.push(codeBlocks[parseInt(codeMatch[1], 10)]);
        continue;
      }

      // ── Table placeholder ──────────────────────────────────
      const tableMatch = trimmed.match(/^%%TABLE_(\d+)%%$/);
      if (tableMatch) {
        flushBlockquote();
        closeAllLists();
        result.push(tableBlocks[parseInt(tableMatch[1], 10)]);
        continue;
      }

      // ── Headings ───────────────────────────────────────────
      const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        flushBlockquote();
        closeAllLists();
        const level = headingMatch[1].length;
        result.push(`<h${level} class="md-h${level}">${this.inlineFormat(headingMatch[2])}</h${level}>`);
        continue;
      }

      // ── Horizontal rule ────────────────────────────────────
      if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(trimmed)) {
        flushBlockquote();
        closeAllLists();
        result.push('<hr class="md-hr">');
        continue;
      }

      // ── Blockquote ─────────────────────────────────────────
      if (trimmed.startsWith('&gt; ') || trimmed === '&gt;') {
        closeAllLists();
        if (!inBlockquote) inBlockquote = true;
        blockquoteLines.push(trimmed.replace(/^&gt;\s?/, ''));
        continue;
      } else if (inBlockquote) {
        flushBlockquote();
      }

      // ── Unordered list ─────────────────────────────────────
      const ulMatch = line.match(/^(\s*)[\-\*\+]\s+(.+)$/);
      if (ulMatch) {
        const indent = Math.floor(ulMatch[1].length / 2);
        const targetDepth = indent + 1;
        const content = ulMatch[2];
        // Adjust list nesting
        while (listStack.length > targetDepth) {
          result.push(listStack.pop() === 'ul' ? '</ul>' : '</ol>');
        }
        if (listStack.length < targetDepth || listStack[listStack.length - 1] !== 'ul') {
          if (listStack.length === targetDepth && listStack[listStack.length - 1] !== 'ul') {
            result.push(listStack.pop() === 'ul' ? '</ul>' : '</ol>');
          }
          result.push('<ul class="md-list">');
          listStack.push('ul');
        }
        result.push(`<li>${this.inlineFormat(content)}</li>`);
        continue;
      }

      // ── Ordered list ───────────────────────────────────────
      const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
      if (olMatch) {
        const indent = Math.floor(olMatch[1].length / 2);
        const targetDepth = indent + 1;
        while (listStack.length > targetDepth) {
          result.push(listStack.pop() === 'ul' ? '</ul>' : '</ol>');
        }
        if (listStack.length < targetDepth || listStack[listStack.length - 1] !== 'ol') {
          if (listStack.length === targetDepth && listStack[listStack.length - 1] !== 'ol') {
            result.push(listStack.pop() === 'ul' ? '</ul>' : '</ol>');
          }
          result.push('<ol class="md-list">');
          listStack.push('ol');
        }
        result.push(`<li>${this.inlineFormat(olMatch[2])}</li>`);
        continue;
      }

      // ── Close lists on non-list content ────────────────────
      if (listStack.length > 0) {
        if (trimmed === '') {
          // Empty line: close lists and add spacing
          closeAllLists();
          result.push('<div class="md-spacer"></div>');
          continue;
        }
        closeAllLists();
      }

      // ── Empty line ─────────────────────────────────────────
      if (trimmed === '') {
        result.push('<div class="md-spacer"></div>');
        continue;
      }

      // ── Regular paragraph ──────────────────────────────────
      result.push(`<p class="md-p">${this.inlineFormat(trimmed)}</p>`);
    }

    flushBlockquote();
    closeAllLists();

    let output = result.join('\n');

    // ── Step 6: Restore code blocks and inline code ──────────
    for (let i = 0; i < codeBlocks.length; i++) {
      output = output.replace(`%%CODEBLOCK_${i}%%`, codeBlocks[i]);
    }
    for (let i = 0; i < inlineCodes.length; i++) {
      output = output.replaceAll(`%%INLINECODE_${i}%%`, inlineCodes[i]);
    }

    return output;
  }

  /** Bold, italic, links, strikethrough, images */
  private inlineFormat(text: string): string {
    return text
      // Images
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" class="md-img">')
      // Links
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      // Bold + italic (*** or ___)
      .replace(/(\*\*\*|___)(.+?)\1/g, '<strong><em>$2</em></strong>')
      // Bold (** or __)
      .replace(/(\*\*|__)(.+?)\1/g, '<strong>$2</strong>')
      // Italic (* or _) — avoid matching list markers
      .replace(/(?<!\w)\*([^\s*](?:.*?[^\s*])?)\*(?!\w)/g, '<em>$1</em>')
      .replace(/(?<!\w)_([^\s_](?:.*?[^\s_])?)_(?!\w)/g, '<em>$1</em>')
      // Strikethrough
      .replace(/~~(.+?)~~/g, '<del>$1</del>')
      // Line-level — (em dash)
      .replace(/ — /g, ' &mdash; ');
  }

  /**
   * Detect whether a code block contains Mermaid diagram syntax
   * even if it wasn't tagged with ```mermaid.
   */
  private isMermaidContent(code: string): boolean {
    const trimmed = code.trim();
    const firstLine = trimmed.split('\n')[0].trim();
    // Match known mermaid diagram type keywords at the start of the block
    return /^(sequenceDiagram|graph\s+(TD|TB|BT|RL|LR)|flowchart\s+(TD|TB|BT|RL|LR)|classDiagram|stateDiagram(-v2)?|erDiagram|gantt|pie|gitgraph|journey|mindmap|timeline|quadrantChart|sankey|xychart|block-beta|architecture-beta|C4Context|C4Container|C4Component|C4Deployment|C4Dynamic|requirementDiagram|zenuml)\b/i.test(firstLine);
  }

  /**
   * Sanitize mermaid code to fix common syntax issues that cause parse errors.
   * - Quotes node labels containing parentheses: A[Text (extra)] → A["Text (extra)"]
   * - Quotes subgraph labels containing spaces or special chars
   */
  private sanitizeMermaid(code: string): string {
    return code.split('\n').map(line => {
      // Fix node labels with parentheses inside square brackets
      // e.g., MQ[Message Broker (RabbitMQ)] → MQ["Message Broker (RabbitMQ)"]
      // But skip cylinder [(...)], stadium ([...]), circle ((..)), already quoted ["..."]
      line = line.replace(/\[([^\]"]*\([^)]*\)[^\]"]*)\]/g, (match, content) => {
        // Skip if starts with ( — that's mermaid cylinder notation [(
        if (content.startsWith('(')) return match;
        return `["${content}"]`;
      });

      // Fix subgraph labels with special characters — quote them
      // e.g., subgraph System["Online Banking System"]
      line = line.replace(/^(\s*subgraph\s+)(\w+)\[([^\]"]+)\]/g, '$1$2["$3"]');

      return line;
    }).join('\n');
  }

  /** Extract and render tables, replacing them with placeholders */
  private extractTables(text: string, tableBlocks: string[]): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      if (
        i + 1 < lines.length &&
        this.isTableRow(lines[i]) &&
        this.isTableSeparator(lines[i + 1])
      ) {
        const headerCells = this.parseTableRow(lines[i]);
        const tableLines: string[] = [];
        tableLines.push('<div class="md-table-wrapper"><table class="md-table">');
        tableLines.push('<thead><tr>');
        headerCells.forEach(c => tableLines.push(`<th>${this.inlineFormat(c)}</th>`));
        tableLines.push('</tr></thead>');
        tableLines.push('<tbody>');
        i += 2; // skip header + separator
        while (i < lines.length && this.isTableRow(lines[i])) {
          const cells = this.parseTableRow(lines[i]);
          tableLines.push('<tr>');
          // Pad or trim cells to match header column count
          for (let c = 0; c < headerCells.length; c++) {
            tableLines.push(`<td>${this.inlineFormat(cells[c] || '')}</td>`);
          }
          tableLines.push('</tr>');
          i++;
        }
        tableLines.push('</tbody></table></div>');
        tableBlocks.push(tableLines.join(''));
        result.push(`%%TABLE_${tableBlocks.length - 1}%%`);
      } else {
        result.push(lines[i]);
        i++;
      }
    }

    return result.join('\n');
  }

  private isTableRow(line: string): boolean {
    const t = line.trim();
    return t.startsWith('|') && t.endsWith('|') && t.split('|').length >= 3;
  }

  private isTableSeparator(line: string): boolean {
    return /^\|[\s\-:|]+\|$/.test(line.trim());
  }

  private parseTableRow(line: string): string[] {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  }
}
