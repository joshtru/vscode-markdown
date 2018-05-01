'use strict';

// https://help.github.com/articles/organizing-information-with-tables/

import { languages, workspace, CancellationToken, DocumentFormattingEditProvider, ExtensionContext, FormattingOptions, Range, TextDocument, TextEdit } from 'vscode';

export function activate(context: ExtensionContext) {
    context.subscriptions.push(languages.registerDocumentFormattingEditProvider('markdown', new MarkdownDocumentFormatter));
}

export function deactivate() { }

class MarkdownDocumentFormatter implements DocumentFormattingEditProvider {
    public provideDocumentFormattingEdits(document: TextDocument, options: FormattingOptions, token: CancellationToken): TextEdit[] | Thenable<TextEdit[]> {
        let edits: TextEdit[] = [];
        let tables = this.detectTables(document.getText());
        if (tables !== null) {
            tables.forEach(table => {
                edits.push(new TextEdit(this.getRange(document, table), this.formatTable(table, document, options)));
            });
            return edits;
        } else {
            return [];
        }
    }

    private detectTables(text: string) {
        const lineBreak = '\\r?\\n';
        const contentLine = '\\|?.*\\|.*\\|?';
        // Trailing [ \t] is required to match trailing whitespaces in the hyphen line before lineBreak
        const hyphenLine = '[ \\t]*\\|?( *:?-{3,}:? *\\|)+( *:?-{3,}:? *\\|?)[ \\t]*'
        const tableRegex = new RegExp(contentLine + lineBreak + hyphenLine + '(?:' + lineBreak + contentLine + ')*', 'g');
        return text.match(tableRegex);
    }

    private getRange(document: TextDocument, text: string) {
        let documentText = document.getText();
        let start = document.positionAt(documentText.indexOf(text));
        let end = document.positionAt(documentText.indexOf(text) + text.length);
        return new Range(start, end);
    }

    /**
     * Return the indentation of a table as a string of spaces by reading it from the first line.
     * In case of `markdown.extension.table.normalizeIdentation` is `enabled` it is rounded to the closest multiple of
     * the configured `tabSize`.
     */
    private getTableIndentation(text: string, options: FormattingOptions) {
        let doNormalize = workspace.getConfiguration('markdown.extension.tableFormatter').get<boolean>('normalizeIndentation')
        let indentRegex = new RegExp(/^(\s*)\S/u)
        let match = text.match(indentRegex)
        let spacesInFirstLine = match[1].length
        let tabStops = Math.round(spacesInFirstLine / options.tabSize)
        let spaces = doNormalize ? " ".repeat(options.tabSize * tabStops) : " ".repeat(spacesInFirstLine)
        return spaces
    }

    private formatTable(text: string, doc: TextDocument, options: FormattingOptions) {
        let indentation = this.getTableIndentation(text, options)

        let rows = []
        let rowsNoIndentPattern = new RegExp(/^\s*(\S.*)$/gum)
        let match = null
        while ((match = rowsNoIndentPattern.exec(text)) !== null) {
            rows.push(match[1])
        }
        // Get all cell contents - Regex works because this can only be  a line of a table
        let fieldRegExp = new RegExp(/(?:\|?((?:\\\||`.*?`|[^\|])+))/gu)

        let colWidth = []
        let cn = /[\u3000-\u9fff\uff01-\uff60‘“’”—]/g;

        let lines = rows.map(row => {
            let field = null
            let values = []
            let i = 0
            while ((field = fieldRegExp.exec(row)) !== null) {
                let cell = field[1].trim()
                values.push(cell)
                // Treat Chinese characters as 2 English ones because of Unicode stuff
                let length = cn.test(cell) ? cell.length + cell.match(cn).length : cell.length
                colWidth[i] = colWidth[i] > length ? colWidth[i] : length

                i = i + 1
            }
            return (values)
        });

        // Normalize the num of hyphen        
        lines[1] = lines[1].map((cell, i) => {
            if (/:-+:/.test(cell)) {
                //:---:
                return ':' + '-'.repeat(colWidth[i] - 2) + ':';
            } else if (/:-+/.test(cell)) {
                //:---
                return ':' + '-'.repeat(colWidth[i] - 1);
            } else if (/-+:/.test(cell)) {
                //---:
                return '-'.repeat(colWidth[i] - 1) + ':';
            } else if (/-+/.test(cell)) {
                //---
                return '-'.repeat(colWidth[i]);
            }
        });

        return lines.map(row => {
            let cells = row.map((cell, i) => {
                let cellLength = colWidth[i];
                if (cn.test(cell)) {
                    cellLength -= cell.match(cn).length;
                }
                return (cell + ' '.repeat(cellLength)).slice(0, cellLength);
            });
            return indentation + '| ' + cells.join(' | ') + ' |';
        }).join(workspace.getConfiguration('files', doc.uri).get('eol'));
    }
}
